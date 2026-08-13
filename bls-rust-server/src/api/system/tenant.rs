use axum::extract::State;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::Value;

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
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:tenant:list")?;
    let rows =
        sqlx::query("SELECT * FROM sys_tenant WHERE deleted=0 ORDER BY create_time DESC LIMIT 100")
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}

async fn public_list(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT tenant_id, tenant_name, domain_name FROM sys_tenant WHERE status='0' AND deleted=0 ORDER BY create_time ASC",
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
    let sql = format!("UPDATE sys_tenant SET deleted=1 WHERE tenant_id IN ({placeholders})");
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
