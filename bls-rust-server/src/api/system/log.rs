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
    #[serde(alias = "pageNum")]
    pub page_num: Option<u64>,
    #[serde(alias = "pageSize")]
    pub page_size: Option<u64>,
    pub username: Option<String>,
    pub business_type: Option<String>,
    pub original_name: Option<String>,
    pub access_type: Option<String>,
    pub upload_status: Option<String>,
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

async fn page_logs(
    state: &AppState,
    table: &str,
    filter_sql: &str,
    binds: Vec<String>,
    order_col: &str,
    q: &LogQuery,
) -> Result<PageResponse<Value>, AppError> {
    let count_sql = format!("SELECT COUNT(*) FROM {table} WHERE 1=1{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q.page_num.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(10).clamp(1, 100);
    let sql = format!(
        "SELECT * FROM {table} WHERE 1=1{filter_sql} ORDER BY {order_col} DESC LIMIT ? OFFSET ?"
    );
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query
        .bind(page_size as i64)
        .bind(((page_num - 1) * page_size) as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(
        Value::Array(rows_to_json(rows)),
        total as u64,
    ))
}

async fn login_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:log:login:list")?;
    let mut filter_sql = String::new();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        filter_sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.login_type.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND login_type = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.login_status.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND login_status = ?");
        binds.push(v.to_string());
    }
    page_logs(
        &state,
        "sys_login_log",
        &filter_sql,
        binds,
        "log_id",
        &q,
    )
    .await
}

async fn operation_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:log:audit:list")?;
    let mut filter_sql = String::new();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        filter_sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.title.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND title LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.business_type.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND business_type = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.module_name.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND module_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.success.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND success = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.client_ip.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND client_ip LIKE ?");
        binds.push(format!("%{v}%"));
    }
    page_logs(
        &state,
        "sys_operation_log",
        &filter_sql,
        binds,
        "log_id",
        &q,
    )
    .await
}

async fn upload_logs(
    State(state): State<AppState>,
    Query(q): Query<LogQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:log:audit:list")?;
    let mut filter_sql = String::new();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        filter_sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.module_name.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND module_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.original_name.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND original_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.access_type.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND access_type = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.upload_status.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND upload_status = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.client_ip.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND client_ip LIKE ?");
        binds.push(format!("%{v}%"));
    }
    page_logs(
        &state,
        "sys_upload_audit",
        &filter_sql,
        binds,
        "audit_id",
        &q,
    )
    .await
}

async fn audit_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:log:audit:detail")?;
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

async fn audit_clean(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:log:audit:clean")?;
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
    crate::middleware::permission::ensure_perm(&user, "system:log:security:list")?;
    let mut filter_sql = String::new();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        filter_sql.push_str(" AND tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(v) = q.event_type.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND event_type = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.risk_level.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND risk_level = ?");
        binds.push(v.to_string());
    }
    if let Some(v) = q.username.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.client_ip.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND client_ip LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.keyword.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND (title LIKE ? OR username LIKE ? OR route LIKE ?)");
        for _ in 0..3 {
            binds.push(format!("%{v}%"));
        }
    }
    page_logs(
        &state,
        "sys_security_log",
        &filter_sql,
        binds,
        "create_time",
        &q,
    )
    .await
}
