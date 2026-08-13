use sqlx::MySqlPool;

use crate::error::{AppError, AppResult};

pub async fn assert_tenant_resource(
    pool: &MySqlPool,
    table: &str,
    id_field: &str,
    id: &str,
    tenant_id: &str,
) -> AppResult<()> {
    let sql = format!("SELECT tenant_id FROM {table} WHERE {id_field} = ? AND deleted = 0");
    let found: Option<String> = sqlx::query_scalar(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;
    match found {
        Some(tid) if tid == tenant_id => Ok(()),
        _ => Err(AppError::NotFound("资源不存在".into())),
    }
}
