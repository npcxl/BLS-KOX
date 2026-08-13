use serde_json::json;
use sqlx::MySqlPool;

pub async fn write_security_log(
    pool: &MySqlPool,
    tenant_id: &str,
    event_type: &str,
    risk_level: u8,
    username: Option<&str>,
    ip: Option<&str>,
    user_agent: Option<&str>,
    request_id: Option<&str>,
    detail: &str,
    raw_data: Option<serde_json::Value>,
) -> anyhow::Result<()> {
    let event_id = crate::utils::snowflake::SnowflakeGenerator::new(1, 1)?.next_id()?;
    sqlx::query(
        "INSERT INTO sys_security_log (event_id, tenant_id, event_type, risk_level, username, ip, user_agent, request_id, detail, raw_data, status, create_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', NOW())",
    )
    .bind(event_id)
    .bind(tenant_id)
    .bind(event_type)
    .bind(risk_level)
    .bind(username)
    .bind(ip)
    .bind(user_agent)
    .bind(request_id)
    .bind(detail)
    .bind(raw_data.map(|v| json!(v.to_string())))
    .execute(pool)
    .await?;
    Ok(())
}
