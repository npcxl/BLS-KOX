use serde_json::{Value, json};
use sqlx::MySqlPool;

use crate::utils::signature::hmac_sha256_hex;

pub async fn run_job(pool: &MySqlPool, job_type: &str, job_data: Value) -> anyhow::Result<Value> {
    match job_type {
        "webhook" => run_webhook(pool, job_data).await,
        "export" => Ok(json!({"exported": true})),
        "import" => Ok(json!({"imported": true})),
        "notification" => Ok(json!({"notified": true})),
        other => anyhow::bail!("no handler for job type: {other}"),
    }
}

async fn run_webhook(pool: &MySqlPool, job_data: Value) -> anyhow::Result<Value> {
    let tenant_id = job_data
        .get("tenantId")
        .and_then(Value::as_str)
        .unwrap_or("000000");
    let webhook_id = job_data
        .get("webhookId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let mut url = job_data
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let mut secret = job_data
        .get("secret")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let event = job_data
        .get("event")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let data = job_data
        .get("data")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));

    if url.is_empty() {
        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT url, secret FROM sys_webhook WHERE webhook_id = ? AND tenant_id = ? AND status = '0'",
        )
        .bind(&webhook_id)
        .bind(tenant_id)
        .fetch_optional(pool)
        .await?;
        if let Some((found_url, found_secret)) = row {
            url = found_url;
            secret = found_secret;
        }
    }

    if url.is_empty() {
        anyhow::bail!("webhook url is required");
    }

    let payload = json!({
        "webhookId": webhook_id,
        "event": event,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "data": data,
    });
    let payload_str = payload.to_string();
    let signature = hmac_sha256_hex(&secret, &payload_str);

    let response = reqwest::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .header("X-Webhook-Signature", signature)
        .header("X-Webhook-ID", &webhook_id)
        .body(payload_str.clone())
        .send()
        .await;

    let delivery_id = crate::utils::snowflake::SnowflakeGenerator::new(1, 1)?.next_id()?;
    match response {
        Ok(res) => {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            let ok = status.is_success();
            sqlx::query(
                "INSERT INTO sys_webhook_delivery (id, webhook_id, event, payload, status, response_code, response_body, error_message, attempt, tenant_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())",
            )
            .bind(delivery_id)
            .bind(webhook_id)
            .bind(event)
            .bind(payload_str)
            .bind(if ok { "success" } else { "failed" })
            .bind(status.as_u16() as i32)
            .bind(body.chars().take(1000).collect::<String>())
            .bind(if ok { Option::<String>::None } else { Some(format!("HTTP {}", status.as_u16())) })
            .bind(tenant_id)
            .execute(pool)
            .await?;
            if ok {
                Ok(json!({"status": status.as_u16()}))
            } else {
                anyhow::bail!("webhook returned HTTP {}", status.as_u16())
            }
        }
        Err(err) => {
            sqlx::query(
                "INSERT INTO sys_webhook_delivery (id, webhook_id, event, payload, status, response_code, response_body, error_message, attempt, tenant_id, created_at)
                 VALUES (?, ?, ?, ?, 'failed', NULL, NULL, ?, 1, ?, NOW())",
            )
            .bind(delivery_id)
            .bind(webhook_id)
            .bind(event)
            .bind(payload_str)
            .bind(err.to_string())
            .bind(tenant_id)
            .execute(pool)
            .await?;
            Err(err.into())
        }
    }
}
