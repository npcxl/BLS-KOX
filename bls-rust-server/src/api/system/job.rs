use axum::extract::{Path, State};
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
    let job_type = body
        .get("jobType")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("缺少 jobType".into()))?;
    let job_data = body.get("jobData").cloned().unwrap_or(Value::Null);
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
        serde_json::json!({"jobId": job_id, "status": "PENDING"}),
    ))
}

async fn get_one(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let row = sqlx::query("SELECT * FROM sys_jobs WHERE job_id = ?")
        .bind(job_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    row.map(|r| ApiResponse::success(crate::db::query::row_to_json(&r)))
        .ok_or_else(|| AppError::NotFound("任务不存在".into()))
}

async fn list(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query("SELECT * FROM sys_jobs ORDER BY created_at DESC LIMIT 50")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(
        crate::db::query::rows_to_json(rows),
    )))
}
