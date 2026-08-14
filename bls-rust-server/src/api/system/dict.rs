use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::Value;
use std::collections::HashMap;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/type/list", get(type_list))
        .route("/type/add", post(type_add))
        .route("/type/edit", put(type_edit))
        .route("/type/remove", delete(type_remove))
        .route("/data/list", get(data_list))
        .route("/data/type", get(data_by_type))
        .route("/data/add", post(data_add))
        .route("/data/edit", put(data_edit))
        .route("/data/remove", delete(data_remove))
}

async fn type_list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:list")?;
    let mut filter_sql = String::from(" WHERE tenant_id = ? AND deleted = 0");
    let mut binds: Vec<String> = vec![user.tenant_id.clone()];
    if let Some(v) = q.get("dictName").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND dict_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.get("dictType").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND dict_type LIKE ?");
        binds.push(format!("%{v}%"));
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_dict_type{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q.get("pageNum").and_then(|s| s.parse::<u64>().ok()).unwrap_or(1).max(1);
    let page_size = q.get("pageSize").and_then(|s| s.parse::<u64>().ok()).unwrap_or(10).clamp(1, 100);
    let offset = (page_num - 1) * page_size;
    let sql = format!("SELECT * FROM sys_dict_type{filter_sql} ORDER BY dict_type_id DESC LIMIT ? OFFSET ?");
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), total as u64))
}
async fn type_add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:add")?;
    let id = state.snowflake.next_id()?;
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    let remark = body.get("remark").and_then(Value::as_str);
    sqlx::query("INSERT INTO sys_dict_type (dict_type_id, dict_name, dict_type, status, remark, tenant_id, deleted, create_time) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())")
        .bind(&id)
        .bind(body.get("dictName").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("dictType").and_then(Value::as_str).unwrap_or(""))
        .bind(status)
        .bind(remark)
        .bind(&user.tenant_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::success_with_message(serde_json::json!({"dictTypeId": id}), "?????"))
}

async fn type_edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:edit")?;
    sqlx::query(
        "UPDATE sys_dict_type SET dict_name=?, dict_type=?, status=?, remark=? WHERE dict_type_id=? AND tenant_id=?",
    )
    .bind(body.get("dictName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("dictType").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("status").and_then(Value::as_str).unwrap_or("0"))
    .bind(body.get("remark").and_then(Value::as_str))
    .bind(body.get("dictTypeId").and_then(Value::as_str).unwrap_or(""))
    .bind(&user.tenant_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("??????"))
}

async fn type_remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "UPDATE sys_dict_type SET deleted=1 WHERE dict_type_id IN ({placeholders}) AND tenant_id = ?"
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query = query.bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("??????"))
}

async fn data_list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:list")?;
    let mut filter_sql = String::from(" WHERE tenant_id = ? AND deleted = 0");
    let mut binds: Vec<String> = vec![user.tenant_id.clone()];
    if let Some(v) = q.get("dictTypeId").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND dict_type_id = ?");
        binds.push(v.clone());
    }
    if let Some(v) = q.get("dictLabel").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND dict_label LIKE ?");
        binds.push(format!("%{v}%"));
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_dict_data{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q.get("pageNum").and_then(|s| s.parse::<u64>().ok()).unwrap_or(1).max(1);
    let page_size = q.get("pageSize").and_then(|s| s.parse::<u64>().ok()).unwrap_or(10).clamp(1, 100);
    let offset = (page_num - 1) * page_size;
    let sql = format!("SELECT * FROM sys_dict_data{filter_sql} ORDER BY dict_sort ASC LIMIT ? OFFSET ?");
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), total as u64))
}
async fn data_by_type(
    State(state): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let dict_type = q.get("dictType").cloned().unwrap_or_default();
    let rows=sqlx::query("SELECT d.* FROM sys_dict_data d JOIN sys_dict_type t ON d.dict_type_id=t.dict_type_id WHERE t.dict_type=? AND d.tenant_id=? AND d.deleted=0 AND d.status='0' ORDER BY d.dict_sort ASC").bind(dict_type).bind(&user.tenant_id).fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}
async fn data_add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:add")?;
    let id = state.snowflake.next_id()?;
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    sqlx::query("INSERT INTO sys_dict_data (dict_data_id, dict_type_id, dict_label, dict_value, dict_sort, tag, status, remark, tenant_id, deleted, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())")
        .bind(&id)
        .bind(body.get("dictTypeId").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("dictLabel").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("dictValue").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("dictSort").and_then(Value::as_i64).unwrap_or(0))
        .bind(body.get("tag").and_then(Value::as_str).unwrap_or(""))
        .bind(status)
        .bind(body.get("remark").and_then(Value::as_str).unwrap_or(""))
        .bind(&user.tenant_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("?????"))
}

async fn data_edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:edit")?;
    sqlx::query("UPDATE sys_dict_data SET dict_label=?, dict_value=?, dict_sort=?, tag=?, status=?, remark=? WHERE dict_data_id=? AND tenant_id=?")
        .bind(body.get("dictLabel").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("dictValue").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("dictSort").and_then(Value::as_i64).unwrap_or(0))
        .bind(body.get("tag").and_then(Value::as_str).unwrap_or(""))
        .bind(body.get("status").and_then(Value::as_str).unwrap_or("0"))
        .bind(body.get("remark").and_then(Value::as_str))
        .bind(body.get("dictDataId").and_then(Value::as_str).unwrap_or(""))
        .bind(&user.tenant_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("??????"))
}

async fn data_remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dict:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "UPDATE sys_dict_data SET deleted=1 WHERE dict_data_id IN ({placeholders}) AND tenant_id = ?"
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query = query.bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("??????"))
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
