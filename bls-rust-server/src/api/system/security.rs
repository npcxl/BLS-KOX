use axum::extract::{Path, State};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(stats))
        .route("/rules", get(rules))
        .route("/events", get(events))
        .route("/blacklist", get(blacklist).post(add_blacklist))
        .route("/blacklist/{id}", delete(remove_blacklist))
}

async fn stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let recent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_security_log WHERE tenant_id = ? AND create_time >= NOW() - INTERVAL 1 HOUR")
        .bind(&user.tenant_id).fetch_one(&state.db).await.unwrap_or(0);
    let blocked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sys_ip_blacklist WHERE tenant_id = ? AND status = '0'",
    )
    .bind(&user.tenant_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    Ok(ApiResponse::success(
        json!({"recentEvents": recent, "blockedIPs": blocked}),
    ))
}

async fn rules(
    State(_state): State<AppState>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    Ok(ApiResponse::success(json!([
        {"code":"LOGIN_FAILED","action":"REQUIRE_REAUTH"},
        {"code":"REFRESH_TOKEN_REUSE","action":"REVOKE_ALL_SESSIONS"},
        {"code":"CROSS_TENANT_ACCESS","action":"BLOCK_IP"}
    ])))
}

async fn events(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_security_log WHERE tenant_id = ? ORDER BY create_time DESC LIMIT 100",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let total: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sys_security_log WHERE tenant_id = ?")
            .bind(&user.tenant_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    Ok(PageResponse::success(
        Value::Array(crate::db::query::rows_to_json(rows)),
        total as u64,
    ))
}

async fn blacklist(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows = sqlx::query("SELECT * FROM sys_ip_blacklist WHERE tenant_id = ? AND status = '0' ORDER BY create_time DESC LIMIT 100")
        .bind(&user.tenant_id).fetch_all(&state.db).await.map_err(AppError::from)?;
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sys_ip_blacklist WHERE tenant_id = ? AND status = '0'",
    )
    .bind(&user.tenant_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    Ok(PageResponse::success(
        Value::Array(crate::db::query::rows_to_json(rows)),
        total as u64,
    ))
}

async fn add_blacklist(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let ip = body
        .get("ipAddress")
        .or_else(|| body.get("ip"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let reason = body.get("reason").and_then(Value::as_str).unwrap_or("");
    let id = state.snowflake.next_id()?;
    sqlx::query("INSERT INTO sys_ip_blacklist (id, ip_address, reason, source, status, expire_at, tenant_id, create_by, create_time) VALUES (?, ?, ?, 'manual', '0', ?, ?, ?, NOW())")
        .bind(id).bind(ip).bind(reason).bind(body.get("expireAt").and_then(Value::as_str)).bind(&user.tenant_id).bind(&user.username).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("加入黑名单成功"))
}

async fn remove_blacklist(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("UPDATE sys_ip_blacklist SET status = '1' WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("移除成功"))
}
