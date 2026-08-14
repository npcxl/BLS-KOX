use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::Value;

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::queue::queue;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create).get(list))
        .route("/{jobId}", get(get_one))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:job:create")?;
    let job_type = body
        .get("jobType")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("缺少 jobType".into()))?;
    let job_data = body
        .get("jobData")
        .filter(|v| !v.is_null())
        .cloned()
        .ok_or_else(|| AppError::BadRequest("??? jobData".into()))?;
    let allowed = ["export", "import", "notification", "webhook"];
    if !allowed.contains(&job_type) {
        return Err(AppError::BadRequest(format!(
            "不允许的 Job 类型: {job_type}"
        )));
    }
    let job_id = queue::enqueue(
        &state.db,
        &user.tenant_id,
        &user.user_id,
        job_type,
        job_data,
    )
    .await?;
    Ok(ApiResponse::success(
        serde_json::json!({"jobId": job_id, "status": "queued"}),
    ))
}

async fn get_one(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:job:read")?;
    let row = sqlx::query("SELECT * FROM sys_jobs WHERE job_id = ? AND tenant_id = ?")
        .bind(job_id)
        .bind(&user.tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    row.map(|r| ApiResponse::success(crate::db::query::row_to_json(&r)))
        .ok_or_else(|| AppError::NotFound("任务不存在".into()))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:job:read")?;
    let mut sql = "SELECT * FROM sys_jobs WHERE tenant_id = ?".to_string();
    if q.get("status").is_some_and(|s| !s.is_empty()) {
        sql.push_str(" AND status = ?");
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT 50");
    let mut query = sqlx::query(&sql).bind(&user.tenant_id);
    if let Some(status) = q.get("status").filter(|s| !s.is_empty()) {
        query = query.bind(status);
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(
        crate::db::query::rows_to_json(rows),
    )))
}