use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list))
        .route("/{roleId}/menus", get(get_menus).put(put_menus))
        .route("/add", post(add))
        .route("/edit", put(edit))
        .route("/remove", delete(remove))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<crate::utils::pagination::PageParams>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:role:list")?;
    let mut filter_sql = String::from(" WHERE deleted = 0");
    let mut binds: Vec<String> = Vec::new();
    filter_sql.push_str(" AND tenant_id = ?");
    binds.push(user.tenant_id.clone());
    if let Some(kw) = q.keyword.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND (role_name LIKE ? OR role_key LIKE ?)");
        binds.push(format!("%{kw}%"));
        binds.push(format!("%{kw}%"));
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_role{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let limit = q.page_size.min(100);
    let offset = (q.page_num.max(1) - 1) * limit;
    let sql = format!("SELECT * FROM sys_role{filter_sql} ORDER BY sort_num ASC LIMIT ? OFFSET ?");
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query.bind(limit as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(
        Value::Array(rows_to_json(rows)),
        total as u64,
    ))
}

async fn get_menus(
    State(state): State<AppState>,
    Path(role_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Vec<String>>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:role:list")?;
    assert_role_owned(&state, &role_id, &user.tenant_id).await?;
    let ids: Vec<String> =
        sqlx::query_scalar("SELECT menu_id FROM sys_role_menu WHERE role_id = ?")
            .bind(role_id)
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(ApiResponse::success(ids))
}

async fn put_menus(
    State(state): State<AppState>,
    Path(role_id): Path<String>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:role:assignMenu")?;
    assert_role_owned(&state, &role_id, &user.tenant_id).await?;
    let menu_ids: Vec<String> = body
        .get("menuIds")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    sqlx::query("DELETE FROM sys_role_menu WHERE role_id = ?")
        .bind(&role_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    for menu_id in menu_ids {
        sqlx::query("INSERT INTO sys_role_menu (role_id, menu_id) VALUES (?, ?)")
            .bind(&role_id)
            .bind(menu_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
    }
    Ok(ApiResponse::message_only("分配成功"))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:role:add")?;
    let id = state.snowflake.next_id()?;
    let name = body.get("roleName").and_then(Value::as_str).unwrap_or("");
    let key = body.get("roleKey").and_then(Value::as_str).unwrap_or("");
    let data_scope = body
        .get("dataScope")
        .and_then(Value::as_str)
        .unwrap_or("TENANT");
    let sort = body.get("sortNum").and_then(Value::as_i64).unwrap_or(0);
    let remark = body.get("remark").and_then(Value::as_str).unwrap_or("");
    sqlx::query("INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, data_scope, sort_num, status, remark, deleted, create_time) VALUES (?, ?, ?, ?, ?, ?, '0', ?, 0, NOW())")
        .bind(id).bind(&user.tenant_id).bind(name).bind(key).bind(data_scope).bind(sort).bind(remark).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("新增成功"))
}

async fn edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:role:edit")?;
    let id = body.get("roleId").and_then(Value::as_str).unwrap_or("");
    let name = body.get("roleName").and_then(Value::as_str).unwrap_or("");
    let key = body.get("roleKey").and_then(Value::as_str).unwrap_or("");
    let data_scope = body
        .get("dataScope")
        .and_then(Value::as_str)
        .unwrap_or("TENANT");
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    let sort = body.get("sortNum").and_then(Value::as_i64).unwrap_or(0);
    let remark = body.get("remark").and_then(Value::as_str).unwrap_or("");
    sqlx::query("UPDATE sys_role SET role_name = ?, role_key = ?, data_scope = ?, sort_num = ?, status = ?, remark = ? WHERE role_id = ? AND tenant_id = ?")
        .bind(name).bind(key).bind(data_scope).bind(sort).bind(status).bind(remark).bind(id).bind(&user.tenant_id).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("编辑成功"))
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:role:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "UPDATE sys_role SET deleted = 1 WHERE role_id IN ({placeholders}) AND tenant_id = ?"
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query = query.bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("删除成功"))
}

async fn assert_role_owned(state: &AppState, role_id: &str, tenant_id: &str) -> Result<(), AppError> {
    let exists: Option<String> = sqlx::query_scalar("SELECT role_id FROM sys_role WHERE role_id=? AND tenant_id=? AND deleted=0")
        .bind(role_id)
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    if exists.is_none() {
        return Err(AppError::NotFound("role not found".into()));
    }
    Ok(())
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
