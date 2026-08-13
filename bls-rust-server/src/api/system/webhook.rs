use axum::extract::{Path, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::Value;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(add))
        .route("/{id}", put(edit).delete(remove))
        .route("/{id}/logs", get(logs))
        .route("/{id}/test", post(test))
        .route("/{id}/retry", post(retry))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_webhook WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}
async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let id = state.snowflake.next_id()?;
    sqlx::query("INSERT INTO sys_webhook (webhook_id, tenant_id, name, url, events, secret, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'0',NOW(),NOW())").bind(id).bind(&user.tenant_id).bind(body.get("name").and_then(Value::as_str).unwrap_or("")).bind(body.get("url").and_then(Value::as_str).unwrap_or("")).bind(body.get("events").cloned().unwrap_or(Value::Array(vec![])).to_string()).bind(body.get("secret").and_then(Value::as_str).unwrap_or("")).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("新增成功"))
}
async fn edit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("UPDATE sys_webhook SET name=?, url=?, events=?, status=? WHERE webhook_id=? AND tenant_id=?")
        .bind(body.get("name").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("url").and_then(Value::as_str).unwrap_or(""))
        .bind(
            body.get("events")
                .cloned()
                .unwrap_or(Value::Array(vec![]))
                .to_string(),
        )
        .bind(body.get("status").and_then(Value::as_str).unwrap_or("0"))
        .bind(id)
        .bind(&_user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("编辑成功"))
}
async fn remove(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("DELETE FROM sys_webhook WHERE webhook_id=? AND tenant_id=?")
        .bind(id)
        .bind(&_user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("删除成功"))
}
async fn logs(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows=sqlx::query("SELECT * FROM sys_webhook_delivery WHERE webhook_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(id).bind(&_user.tenant_id).fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}
async fn test(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let url: String = sqlx::query_scalar("SELECT url FROM sys_webhook WHERE webhook_id=?")
        .bind(id)
        .fetch_one(&state.db)
        .await
        .map_err(AppError::from)?;
    let res = state
        .http
        .post(&url)
        .json(&serde_json::json!({"event":"test"}))
        .send()
        .await;
    let ok = res.map(|r| r.status().is_success()).unwrap_or(false);
    Ok(ApiResponse::success(serde_json::json!({"success": ok})))
}
async fn retry(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query(
        "UPDATE sys_webhook_delivery SET status='pending' WHERE webhook_id=? AND tenant_id=?",
    )
    .bind(id)
    .bind(&_user.tenant_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("重试已提交"))
}
