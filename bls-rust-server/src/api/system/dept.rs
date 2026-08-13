use axum::extract::{Path, State};
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
        .route("/{deptId}/users", get(users))
        .route("/add", post(add))
        .route("/edit", put(edit))
        .route("/remove", delete(remove))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dept:list")?;
    let rows = sqlx::query(
        "SELECT * FROM sys_dept WHERE tenant_id = ? AND deleted = 0 ORDER BY sort_num ASC",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(build_tree(
        rows_to_json(rows),
        "parentId",
        "deptId",
    ))))
}

async fn users(
    State(state): State<AppState>,
    Path(dept_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query("SELECT user_id, username, nickname, status, email, phone FROM sys_user WHERE dept_id = ? AND tenant_id = ? AND deleted = 0 ORDER BY create_time ASC")
        .bind(dept_id).bind(&user.tenant_id).fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dept:add")?;
    let id = state.snowflake.next_id()?;
    let parent_id = body
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or("000000");
    let dept_name = body.get("deptName").and_then(Value::as_str).unwrap_or("");
    let sort = body.get("sortNum").and_then(Value::as_i64).unwrap_or(0);
    sqlx::query("INSERT INTO sys_dept (dept_id, tenant_id, parent_id, dept_name, sort_num, status, deleted, create_time) VALUES (?, ?, ?, ?, ?, '0', 0, NOW())")
        .bind(id).bind(&user.tenant_id).bind(parent_id).bind(dept_name).bind(sort).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("新增成功"))
}

async fn edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dept:edit")?;
    let id = body.get("deptId").and_then(Value::as_str).unwrap_or("");
    let dept_name = body.get("deptName").and_then(Value::as_str).unwrap_or("");
    let parent_id = body
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or("000000");
    let sort = body.get("sortNum").and_then(Value::as_i64).unwrap_or(0);
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    sqlx::query(
        "UPDATE sys_dept SET parent_id=?, dept_name=?, sort_num=?, status=? WHERE dept_id=? AND tenant_id=?",
    )
    .bind(parent_id)
    .bind(dept_name)
    .bind(sort)
    .bind(status)
    .bind(id)
    .bind(&user.tenant_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("编辑成功"))
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:dept:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "UPDATE sys_dept SET deleted = 1 WHERE dept_id IN ({placeholders}) AND tenant_id = ?"
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query = query.bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("删除成功"))
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
