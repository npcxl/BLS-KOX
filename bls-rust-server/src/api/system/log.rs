use axum::extract::{Path, Query, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::Value;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::rows_to_json;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize, Default)]
pub struct LogQuery {
    pub page_num: Option<u64>,
    pub page_size: Option<u64>,
    pub username: Option<String>,
    pub title: Option<String>,
    pub module_name: Option<String>,
    pub success: Option<String>,
    pub client_ip: Option<String>,
    pub login_type: Option<String>,
    pub login_status: Option<String>,
    pub event_type: Option<String>,
    pub risk_level: Option<String>,
    pub keyword: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", get(login_logs))
        .route("/operation", get(operation_logs))
        .route("/upload", get(upload_logs))
        .route("/audit/detail/{id}", get(audit_detail))
        .route("/audit/clean", delete(audit_clean))
        .route("/security", get(security_logs))
}

async fn login_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let mut sql = "SELECT * FROM sys_login_log WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.login_type.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND login_type = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.login_status.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND login_status = ?");
        binds.push(v.to_string());
    }
    sql.push_str(" ORDER BY login_time DESC LIMIT 100");
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}

async fn operation_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let mut sql = "SELECT * FROM sys_operation_log WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.title.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND title LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.module_name.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND module_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.success.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND success = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.client_ip.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND client_ip LIKE ?");
        binds.push(format!("%{v}%"));
    }
    sql.push_str(" ORDER BY operator_time DESC LIMIT 100");
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}

async fn upload_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let mut sql = "SELECT * FROM sys_upload_audit WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.module_name.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND module_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    sql.push_str(" ORDER BY create_time DESC LIMIT 100");
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}

async fn audit_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let row = sqlx::query("SELECT * FROM sys_operation_log WHERE log_id=?")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(
        row.map(|r| crate::db::query::row_to_json(&r))
            .unwrap_or(Value::Null),
    ))
}

async fn audit_clean(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("DELETE FROM sys_operation_log")
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("cleaned"))
}

async fn security_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let mut sql = "SELECT * FROM sys_security_log WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.event_type.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND event_type = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.risk_level.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND risk_level = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.keyword.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND (title LIKE ? OR username LIKE ? OR route LIKE ?)");
        for _ in 0..3 {
            binds.push(format!("%{v}%"));
        }
    }
    sql.push_str(" ORDER BY create_time DESC LIMIT 100");
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}
