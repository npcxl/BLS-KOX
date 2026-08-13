use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(stats))
        .route("/system-status", get(system_status))
        .route("/recent-logs", get(recent_logs))
}

async fn stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let users: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sys_user WHERE tenant_id = ? AND deleted = 0")
            .bind(&user.tenant_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    let roles: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sys_role WHERE tenant_id = ? AND deleted = 0")
            .bind(&user.tenant_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    let depts: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sys_dept WHERE tenant_id = ? AND deleted = 0")
            .bind(&user.tenant_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    let menus: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_menu WHERE status='0'")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    let logs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_operation_log")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    Ok(ApiResponse::success(
        json!({"userCount": users, "roleCount": roles, "deptCount": depts, "menuCount": menus, "logCount": logs}),
    ))
}

async fn system_status(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let db = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();
    let redis = if let Some(client) = &state.redis {
        match client.get_multiplexed_tokio_connection().await {
            Ok(mut conn) => redis::cmd("PING")
                .query_async::<String>(&mut conn)
                .await
                .is_ok(),
            Err(_) => false,
        }
    } else {
        false
    };
    Ok(ApiResponse::success(json!({"mysql": db, "redis": redis})))
}

async fn recent_logs(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT title, username, business_type AS businessType, operator_time AS createTime FROM sys_operation_log WHERE tenant_id = ? ORDER BY operator_time DESC LIMIT 5",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(
        crate::db::query::rows_to_json(rows),
    )))
}
