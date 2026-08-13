use serde_json::Value;

use crate::state::AppState;

pub async fn emit(
    state: &AppState,
    event_type: &str,
    tenant_id: &str,
    payload: Value,
) -> anyhow::Result<()> {
    let event_id = crate::utils::snowflake::SnowflakeGenerator::new(1, 1)?.next_id()?;
    emit_event(state, &event_id, event_type, tenant_id, payload).await
}

pub async fn emit_event(
    state: &AppState,
    event_id: &str,
    event_type: &str,
    tenant_id: &str,
    payload: Value,
) -> anyhow::Result<()> {
    let Some(url) = &state.config.event_service.url else {
        return Ok(());
    };
    let events = serde_json::json!([{
        "eventId": event_id,
        "eventType": event_type,
        "tenantId": tenant_id,
        "payload": payload,
    }]);
    state
        .http
        .post(format!("{url}/internal/events"))
        .header("X-Internal-Token", &state.config.internal_secret)
        .json(&serde_json::json!({ "events": events }))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
