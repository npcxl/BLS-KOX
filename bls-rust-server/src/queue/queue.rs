use serde_json::Value;
use sqlx::MySqlPool;

pub async fn enqueue(
    pool: &MySqlPool,
    tenant_id: &str,
    user_id: &str,
    job_type: &str,
    job_data: Value,
) -> anyhow::Result<String> {
    let job_id = crate::utils::snowflake::SnowflakeGenerator::new(1, 1)?.next_id()?;
    sqlx::query(
        "INSERT INTO sys_jobs (job_id, tenant_id, user_id, job_type, job_data, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'queued', NOW())",
    )
    .bind(&job_id)
    .bind(tenant_id)
    .bind(user_id)
    .bind(job_type)
    .bind(job_data.to_string())
    .execute(pool)
    .await?;
    Ok(job_id)
}
