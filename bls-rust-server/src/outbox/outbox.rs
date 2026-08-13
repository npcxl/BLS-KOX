use serde_json::Value;
use sqlx::MySqlPool;

pub async fn append(
    pool: &MySqlPool,
    event_type: &str,
    tenant_id: &str,
    payload: Value,
) -> anyhow::Result<String> {
    let event_id = crate::utils::snowflake::SnowflakeGenerator::new(1, 1)?.next_id()?;
    sqlx::query(
        "INSERT INTO outbox_event (event_id, event_type, tenant_id, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())",
    )
    .bind(&event_id)
    .bind(event_type)
    .bind(tenant_id)
    .bind(payload.to_string())
    .execute(pool)
    .await?;
    Ok(event_id)
}
