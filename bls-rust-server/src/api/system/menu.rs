use std::collections::{HashMap, HashSet};

use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::Value;

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::state::AppState;
use crate::utils::menu_tree::build_tree;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list))
        .route("/package-tree", get(package_tree))
        .route("/{id}", get(get_one))
        .route("/add", post(add))
        .route("/edit", put(edit))
        .route("/remove", delete(remove))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:menu:list")?;
    let rows = sqlx::query("SELECT * FROM sys_menu ORDER BY sort_num ASC")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    let mut values = rows_to_json(rows);

    let keyword = q
        .get("keyword")
        .or_else(|| q.get("menuName"))
        .map(String::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if !keyword.is_empty() {
        let mut parent_map = HashMap::new();
        for row in &values {
            let id = row.get("menuId").and_then(Value::as_str).unwrap_or("").to_string();
            let parent = row.get("parentId").and_then(Value::as_str).unwrap_or("0").to_string();
            parent_map.insert(id, parent);
        }
        let mut matched = HashSet::new();
        for row in &values {
            let name = row.get("menuName").and_then(Value::as_str).unwrap_or("");
            if name.contains(&keyword) {
                let mut current = row.get("menuId").and_then(Value::as_str).unwrap_or("").to_string();
                while !current.is_empty() && current != "0" {
                    matched.insert(current.clone());
                    current = parent_map
                        .get(&current)
                        .cloned()
                        .unwrap_or_else(|| "0".to_string());
                }
            }
        }
        values.retain(|row| {
            row.get("menuId")
                .and_then(Value::as_str)
                .map(|id| matched.contains(id))
                .unwrap_or(false)
        });
    }

    Ok(ApiResponse::success(Value::Array(build_tree(
        values,
        "parentId",
        "menuId",
    ))))
}

async fn package_tree(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query("SELECT * FROM sys_menu WHERE status='0' ORDER BY sort_num ASC")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(build_tree(
        rows_to_json(rows),
        "parentId",
        "menuId",
    ))))
}

async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:menu:list")?;
    let row = sqlx::query("SELECT * FROM sys_menu WHERE menu_id=?")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    row.map(|r| ApiResponse::success(row_to_json(&r)))
        .ok_or_else(|| AppError::NotFound("menu not found".into()))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:menu:add")?;
    let id = state.snowflake.next_id()?;
    let parent_id = body
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or("000000");
    let menu_name = body.get("menuName").and_then(Value::as_str).unwrap_or("");
    let path = body.get("path").and_then(Value::as_str);
    let component = body.get("component").and_then(Value::as_str);
    let perms = body.get("perms").and_then(Value::as_str);
    let icon = body.get("icon").and_then(Value::as_str);
    let menu_type = body.get("menuType").and_then(Value::as_str).unwrap_or("1");
    let sort = body.get("sortNum").and_then(Value::as_i64).unwrap_or(0);
    sqlx::query(
        "INSERT INTO sys_menu (menu_id, parent_id, menu_name, path, component, perms, icon, menu_type, sort_num, status, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '0', NOW())",
    )
    .bind(id)
    .bind(parent_id)
    .bind(menu_name)
    .bind(path)
    .bind(component)
    .bind(perms)
    .bind(icon)
    .bind(menu_type)
    .bind(sort)
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
    crate::middleware::permission::ensure_perm(&user, "system:menu:edit")?;
    let id = body.get("menuId").and_then(Value::as_str).unwrap_or("");
    let parent_id = body
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or("000000");
    let menu_name = body.get("menuName").and_then(Value::as_str).unwrap_or("");
    let path = body.get("path").and_then(Value::as_str);
    let component = body.get("component").and_then(Value::as_str);
    let perms = body.get("perms").and_then(Value::as_str);
    let icon = body.get("icon").and_then(Value::as_str);
    let menu_type = body.get("menuType").and_then(Value::as_str).unwrap_or("1");
    let sort = body.get("sortNum").and_then(Value::as_i64).unwrap_or(0);
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    sqlx::query(
        "UPDATE sys_menu SET parent_id=?, menu_name=?, path=?, component=?, perms=?, icon=?, menu_type=?, sort_num=?, status=? WHERE menu_id=?",
    )
    .bind(parent_id)
    .bind(menu_name)
    .bind(path)
    .bind(component)
    .bind(perms)
    .bind(icon)
    .bind(menu_type)
    .bind(sort)
    .bind(status)
    .bind(id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("updated"))
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:menu:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let all_ids = collect_descendants(&state, ids).await?;
    let placeholders = vec!["?"; all_ids.len()].join(", ");
    let delete_role_menu_sql =
        format!("DELETE FROM sys_role_menu WHERE menu_id IN ({placeholders})");
    let mut query = sqlx::query(&delete_role_menu_sql);
    for id in &all_ids {
        query = query.bind(id.clone());
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    let delete_menu_sql = format!("DELETE FROM sys_menu WHERE menu_id IN ({placeholders})");
    let mut query = sqlx::query(&delete_menu_sql);
    for id in &all_ids {
        query = query.bind(id.clone());
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("deleted"))
}

async fn collect_descendants(
    state: &AppState,
    roots: Vec<String>,
) -> Result<Vec<String>, AppError> {
    let mut all = std::collections::HashSet::new();
    let mut queue = roots;
    while let Some(parent_id) = queue.pop() {
        if !all.insert(parent_id.clone()) {
            continue;
        }
        let children: Vec<String> =
            sqlx::query_scalar("SELECT menu_id FROM sys_menu WHERE parent_id=?")
                .bind(&parent_id)
                .fetch_all(&state.db)
                .await
                .map_err(AppError::from)?;
        for child in children {
            if !all.contains(&child) {
                queue.push(child);
            }
        }
    }
    Ok(all.into_iter().collect())
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
