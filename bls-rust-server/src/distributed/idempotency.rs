use redis::AsyncCommands;
use serde_json::Value;

use crate::error::AppResult;
use crate::state::AppState;

pub async fn get_cached(state: &AppState, key: &str) -> AppResult<Option<(u16, Value)>> {
    let Some(client) = &state.redis else {
        return Ok(None);
    };
    let mut conn = client.get_multiplexed_tokio_connection().await?;
    let full = format!("{}idem:{}", state.config.redis.key_prefix, key);
    let value: Option<String> = conn.get(full).await?;
    Ok(value
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| {
            let status = v.get("status").and_then(Value::as_u64).unwrap_or(200) as u16;
            let body = v.get("body").cloned().unwrap_or(Value::Null);
            Some((status, body))
        }))
}

pub async fn save(
    state: &AppState,
    key: &str,
    status: u16,
    body: Value,
    ttl_seconds: u64,
) -> AppResult<()> {
    let Some(client) = &state.redis else {
        return Ok(());
    };
    let mut conn = client.get_multiplexed_tokio_connection().await?;
    let full = format!("{}idem:{}", state.config.redis.key_prefix, key);
    let value = serde_json::json!({"status": status, "body": body}).to_string();
    let _: () = conn.set_ex(full, value, ttl_seconds).await?;
    Ok(())
}
