use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::rows_to_json;
use crate::error::AppError;
use crate::state::AppState;
use crate::utils::signature::{hmac_sha256_hex, sha256_hex};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(add))
        .route("/{id}", put(edit).delete(remove))
        .route("/{id}/logs", get(logs))
        .route("/{id}/test", post(test))
        .route("/{id}/retry", post(retry))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:list")?;
    let rows = sqlx::query(
        "SELECT * FROM sys_webhook WHERE tenant_id=? ORDER BY created_at DESC",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:add")?;
    let url = body.get("url").and_then(Value::as_str).unwrap_or("").trim().to_string();
    validate_webhook_url(&url)?;
    let id = state.snowflake.next_id()?;
    let secret_full = sha256_hex(&format!(
        "{}-{}",
        id,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let secret = secret_full.chars().take(32).collect::<String>();

    sqlx::query(
        "INSERT INTO sys_webhook (webhook_id, tenant_id, name, url, events, secret, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'0',NOW(),NOW())",
    )
    .bind(&id)
    .bind(&user.tenant_id)
    .bind(body.get("name").and_then(Value::as_str).unwrap_or(""))
    .bind(&url)
    .bind(body.get("events").cloned().unwrap_or(Value::Array(vec![])).to_string())
    .bind(&secret)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(ApiResponse::success_with_message(
        serde_json::json!({"webhookId": id, "secret": secret}),
        "webhook created",
    ))
}

async fn edit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:edit")?;
    let existing: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT name, url, events, status FROM sys_webhook WHERE webhook_id=? AND tenant_id=?",
    )
    .bind(&id)
    .bind(&user.tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;

    let Some((old_name, old_url, old_events, old_status)) = existing else {
        return Err(AppError::NotFound("webhook not found".into()));
    };

    let url = match body.get("url").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        Some(value) => value.trim().to_string(),
        None => old_url.clone(),
    };
    validate_webhook_url(&url)?;

    let name = body.get("name").and_then(Value::as_str).unwrap_or(&old_name);
    let events = match body.get("events") {
        Some(value) => value.clone(),
        None => serde_json::from_str(&old_events).unwrap_or(Value::Array(vec![])),
    };
    let status = body.get("status").and_then(Value::as_str).unwrap_or(&old_status);

    sqlx::query(
        "UPDATE sys_webhook SET name=?, url=?, events=?, status=?, updated_at=NOW() WHERE webhook_id=? AND tenant_id=?",
    )
    .bind(name)
    .bind(&url)
    .bind(events.to_string())
    .bind(status)
    .bind(&id)
    .bind(&user.tenant_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(ApiResponse::message_only("webhook updated"))
}

async fn remove(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:remove")?;
    sqlx::query("DELETE FROM sys_webhook WHERE webhook_id=? AND tenant_id=?")
        .bind(id)
        .bind(&user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("webhook removed"))
}

async fn logs(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:logs")?;
    let mut filter_sql = String::from(" WHERE webhook_id = ? AND tenant_id = ?");
    let mut binds: Vec<String> = vec![id.clone(), user.tenant_id.clone()];

    if let Some(event) = q.get("event").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND event = ?");
        binds.push(event.clone());
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_webhook_delivery{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q.get("pageNum").and_then(|s| s.parse::<u64>().ok()).unwrap_or(1).max(1);
    let page_size = q.get("pageSize").and_then(|s| s.parse::<u64>().ok()).unwrap_or(20).clamp(1, 100);
    let offset = (page_num - 1) * page_size;

    let sql = format!("SELECT * FROM sys_webhook_delivery{filter_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?");
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;

    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), total as u64))
}

async fn test(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:test")?;
    let webhook: Option<(String, String)> = sqlx::query_as(
        "SELECT url, secret FROM sys_webhook WHERE webhook_id=? AND tenant_id=?",
    )
    .bind(&id)
    .bind(&user.tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;

    let Some((url, secret)) = webhook else {
        return Err(AppError::NotFound("webhook not found".into()));
    };

    let payload = serde_json::json!({
        "event": "test",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    })
    .to_string();
    let signature = hmac_sha256_hex(&secret, &payload);
    let start = Instant::now();
    let response = state
        .http
        .post(&url)
        .timeout(Duration::from_secs(10))
        .header("Content-Type", "application/json")
        .header("X-Webhook-Signature", signature)
        .body(payload.clone())
        .send()
        .await;

    match response {
        Ok(res) => {
            let status_code = res.status().as_u16();
            let response_body = res.text().await.unwrap_or_default();
            let ok = status_code >= 200 && status_code < 300;
            let log_id = state.snowflake.next_id()?;
            let status = if ok { "success" } else { "failed" };
            let error_message = if ok { None } else { Some(format!("HTTP {status_code}")) };
            sqlx::query(
                "INSERT INTO sys_webhook_delivery (id, webhook_id, event, payload, status, response_code, response_body, error_message, attempt, tenant_id, created_at)
                 VALUES (?, ?, 'test', ?, ?, ?, ?, ?, 1, ?, NOW())",
            )
            .bind(log_id)
            .bind(&id)
            .bind(&payload)
            .bind(status)
            .bind(status_code as i32)
            .bind(&response_body.chars().take(500).collect::<String>())
            .bind(error_message)
            .bind(&user.tenant_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;

            if ok {
                Ok(ApiResponse::success(serde_json::json!({
                    "responseCode": status_code,
                    "elapsedMs": start.elapsed().as_millis() as u64,
                })))
            } else {
                Err(AppError::Internal(anyhow::anyhow!(
                    "HTTP {status_code}: {}",
                    response_body.chars().take(200).collect::<String>()
                )))
            }
        }
        Err(err) => {
            let log_id = state.snowflake.next_id()?;
            sqlx::query(
                "INSERT INTO sys_webhook_delivery (id, webhook_id, event, payload, status, error_message, attempt, tenant_id, created_at)
                 VALUES (?, ?, 'test', ?, 'failed', ?, 1, ?, NOW())",
            )
            .bind(log_id)
            .bind(&id)
            .bind(&payload)
            .bind(&err.to_string().chars().take(500).collect::<String>())
            .bind(&user.tenant_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
            Err(AppError::Internal(anyhow::anyhow!("????: {err}")))
        }
    }
}

async fn retry(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:webhook:logs")?;
    sqlx::query(
        "UPDATE sys_webhook_delivery SET status='pending' WHERE webhook_id=? AND tenant_id=?",
    )
    .bind(id)
    .bind(&user.tenant_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("retry submitted"))
}

fn validate_webhook_url(url: &str) -> Result<(), AppError> {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        Ok(())
    } else {
        Err(AppError::BadRequest("URL must start with http:// or https://".into()))
    }
}
