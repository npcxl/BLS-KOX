use serde_json::Value;
use sqlx::MySqlPool;

use crate::db::query::row_to_json;
use crate::services::event_client;

pub async fn publish_due(pool: &MySqlPool, state: &crate::state::AppState) -> anyhow::Result<u64> {
    let claimed = sqlx::query(
        "UPDATE outbox_event SET status = 'processing', processing_at = NOW()
         WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         ORDER BY created_at ASC LIMIT 100",
    )
    .execute(pool)
    .await?;

    let rows = sqlx::query(
        "SELECT event_id, event_type, tenant_id, payload_json, retry_count FROM outbox_event
         WHERE status = 'processing' AND processing_at >= NOW() - INTERVAL 5 MINUTE
         ORDER BY created_at ASC LIMIT 100",
    )
    .fetch_all(pool)
    .await?;

    let mut published = 0u64;
    for row in rows {
        let value = row_to_json(&row);
        let Some(event_id) = value.get("eventId").and_then(Value::as_str) else {
            continue;
        };
        let event_type = value
            .get("eventType")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let tenant_id = value
            .get("tenantId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let payload = value.get("payloadJson").cloned().unwrap_or(Value::Null);
        let retry_count = value.get("retryCount").and_then(Value::as_i64).unwrap_or(0) as i64;

        match event_client::emit_event(state, &event_id, &event_type, &tenant_id, payload).await {
            Ok(()) => {
                sqlx::query(
                    "UPDATE outbox_event SET status = 'published', published_at = NOW() WHERE event_id = ?",
                )
                .bind(event_id)
                .execute(pool)
                .await?;
                published += 1;
            }
            Err(err) => {
                if retry_count + 1 >= 5 {
                    sqlx::query(
                        "UPDATE outbox_event SET status = 'failed', retry_count = retry_count + 1 WHERE event_id = ?",
                    )
                    .bind(event_id)
                    .execute(pool)
                    .await?;
                } else {
                    sqlx::query(
                        "UPDATE outbox_event SET status = 'pending', retry_count = retry_count + 1, next_retry_at = NOW() + INTERVAL 30 SECOND WHERE event_id = ?",
                    )
                    .bind(event_id)
                    .execute(pool)
                    .await?;
                }
            }
        }
    }
    let _ = claimed;
    Ok(published)
}
