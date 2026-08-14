use axum::extract::{Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::Value;
use std::collections::HashMap;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::rows_to_json;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list))
        .route("/public-list", get(public_list))
        .route("/add", post(add))
        .route("/edit", put(edit))
        .route("/status", put(update_status))
        .route("/remove", delete(remove))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:tenant:list")?;
    let mut filter_sql = String::from(" WHERE 1=1");
    let mut binds: Vec<String> = Vec::new();
    if let Some(kw) = q.get("keyword").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND (tenant_name LIKE ? OR domain_name LIKE ? OR contact_user LIKE ? OR contact_phone LIKE ?)");
        for _ in 0..4 { binds.push(format!("%{kw}%")); }
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_tenant{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds { count_query = count_query.bind(b.clone()); }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q.get("pageNum").and_then(|s| s.parse::<u64>().ok()).unwrap_or(1).max(1);
    let page_size = q.get("pageSize").and_then(|s| s.parse::<u64>().ok()).unwrap_or(10).clamp(1, 100);
    let offset = (page_num - 1) * page_size;
    let sql = format!("SELECT * FROM sys_tenant{filter_sql} ORDER BY create_time DESC LIMIT ? OFFSET ?");
    let mut query = sqlx::query(&sql);
    for b in binds { query = query.bind(b); }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), total as u64))
}

async fn public_list(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_tenant WHERE status='0' AND deleted=0 ORDER BY create_time ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:tenant:add")?;
    let id = state.snowflake.next_id()?;
    sqlx::query(
        "INSERT INTO sys_tenant (tenant_id, tenant_name, package_id, expire_time, domain_name, contact_user, contact_phone, status, remark, deleted, create_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, '0', ?, 0, NOW())",
    )
    .bind(&id)
    .bind(body.get("tenantName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("packageId").and_then(Value::as_str))
    .bind(body.get("expireTime").and_then(Value::as_str))
    .bind(body.get("domainName").and_then(Value::as_str))
    .bind(body.get("contactUser").and_then(Value::as_str))
    .bind(body.get("contactPhone").and_then(Value::as_str))
    .bind(body.get("remark").and_then(Value::as_str))
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("created"))
}

async fn edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:tenant:edit")?;
    sqlx::query(
        "UPDATE sys_tenant SET tenant_name=?, package_id=?, expire_time=?, domain_name=?, contact_user=?, contact_phone=?, status=?, remark=? WHERE tenant_id=?",
    )
    .bind(body.get("tenantName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("packageId").and_then(Value::as_str))
    .bind(body.get("expireTime").and_then(Value::as_str))
    .bind(body.get("domainName").and_then(Value::as_str))
    .bind(body.get("contactUser").and_then(Value::as_str))
    .bind(body.get("contactPhone").and_then(Value::as_str))
    .bind(body.get("status").and_then(Value::as_str).unwrap_or("0"))
    .bind(body.get("remark").and_then(Value::as_str))
    .bind(body.get("tenantId").and_then(Value::as_str).unwrap_or(""))
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("updated"))
}

async fn update_status(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:tenant:edit")?;
    sqlx::query("UPDATE sys_tenant SET status=? WHERE tenant_id=?")
        .bind(body.get("status").and_then(Value::as_str).unwrap_or("0"))
        .bind(body.get("tenantId").and_then(Value::as_str).unwrap_or(""))
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("status updated"))
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:tenant:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!("DELETE FROM sys_tenant WHERE tenant_id IN ({placeholders})");
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("deleted"))
}

fn ids_from_body(body: &Value) -> Vec<String> {
    let ids = body
        .get("ids")
        .or_else(|| body.get("idList"))
        .unwrap_or(&Value::Null);
    match ids {
        Value::Array(items) => items
            .iter()
            .filter_map(|v| v.as_str().map(ToOwned::to_owned))
            .collect(),
        Value::String(s) => s
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}
