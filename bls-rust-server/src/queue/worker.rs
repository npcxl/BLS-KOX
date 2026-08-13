use std::time::Duration;

use serde_json::Value;
use sqlx::MySqlPool;

use crate::db::query::row_to_json;

pub async fn run(pool: MySqlPool) {
    loop {
        let _ = process_due(&pool).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn process_due(pool: &MySqlPool) -> anyhow::Result<()> {
    let rows = sqlx::query(
        "SELECT job_id, job_type, job_data, attempt, max_attempts FROM sys_jobs
         WHERE status = 'queued' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         ORDER BY created_at ASC LIMIT 10",
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        let value = row_to_json(&row);
        let Some(job_id) = value.get("jobId").and_then(Value::as_str) else {
            continue;
        };
        let Some(job_type) = value.get("jobType").and_then(Value::as_str) else {
            continue;
        };
        let job_data = value.get("jobData").cloned().unwrap_or(Value::Null);
        let attempt = value.get("attempt").and_then(Value::as_i64).unwrap_or(0) as i64;
        let max_attempts = value
            .get("maxAttempts")
            .and_then(Value::as_i64)
            .unwrap_or(3) as i64;

        sqlx::query(
            "UPDATE sys_jobs SET status = 'processing', attempt = ?, updated_at = NOW() WHERE job_id = ?",
        )
        .bind(attempt + 1)
        .bind(job_id)
        .execute(pool)
        .await?;

        match super::jobs::run_job(pool, job_type, job_data).await {
            Ok(result) => {
                sqlx::query(
                    "UPDATE sys_jobs SET status = 'completed', result = ?, error_message = NULL, updated_at = NOW() WHERE job_id = ?",
                )
                .bind(result.to_string())
                .bind(job_id)
                .execute(pool)
                .await?;
            }
            Err(err) => {
                if attempt + 1 >= max_attempts {
                    sqlx::query(
                        "UPDATE sys_jobs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE job_id = ?",
                    )
                    .bind(err.to_string())
                    .bind(job_id)
                    .execute(pool)
                    .await?;
                } else {
                    sqlx::query(
                        "UPDATE sys_jobs SET status = 'queued', next_retry_at = NOW() + INTERVAL 30 SECOND, error_message = ?, updated_at = NOW() WHERE job_id = ?",
                    )
                    .bind(err.to_string())
                    .bind(job_id)
                    .execute(pool)
                    .await?;
                }
            }
        }
    }
    Ok(())
}
