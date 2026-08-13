use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/report", post(report))
        .route("/list", get(list))
        .route("/stats", get(stats))
}

async fn report(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let usage_id = state.snowflake.next_id()?;
    sqlx::query(
        "INSERT INTO sys_ai_usage (usage_id, tenant_id, user_id, username, model_name, provider, endpoint, prompt_tokens, completion_tokens, total_tokens, estimated_cost, elapsed_ms, success, stream_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?, 1, 0, NOW())",
    )
    .bind(usage_id)
    .bind(body.get("tenantId").and_then(Value::as_str).unwrap_or("000000"))
    .bind(body.get("userId").and_then(Value::as_str))
    .bind(body.get("username").and_then(Value::as_str))
    .bind(body.get("modelName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("provider").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("promptTokens").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("completionTokens").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("totalTokens").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("cost").or_else(|| body.get("estimatedCost")).and_then(Value::as_f64).unwrap_or(0.0))
    .bind(body.get("elapsedMs").and_then(Value::as_i64).unwrap_or(0))
    .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("上报成功"))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_ai_usage WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_ai_usage WHERE tenant_id = ?")
        .bind(&user.tenant_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    Ok(PageResponse::success(
        Value::Array(crate::db::query::rows_to_json(rows)),
        total as u64,
    ))
}

async fn stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let row: (i64, i64, f64) = sqlx::query_as(
        "SELECT COALESCE(SUM(total_tokens),0), COUNT(*), COALESCE(SUM(estimated_cost),0) FROM sys_ai_usage WHERE tenant_id = ?",
    )
    .bind(&user.tenant_id).fetch_one(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::success(
        json!({"totalTokens": row.0, "requests": row.1, "totalCost": row.2}),
    ))
}
