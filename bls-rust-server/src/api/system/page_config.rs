use axum::extract::{Path, State};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde_json::Value;

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list))
        .route("/page/{pageCode}", get(page).delete(delete_page))
        .route("/page/{pageCode}/columns", get(columns))
        .route("/save", post(save))
}

fn bool_to_i64(value: &Value, default: i64) -> i64 {
    match value {
        Value::Bool(true) => 1,
        Value::Bool(false) => 0,
        Value::Number(n) => n.as_i64().unwrap_or(default),
        _ => default,
    }
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_page_config WHERE tenant_id=? AND deleted=0 ORDER BY sort ASC",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn page(
    State(state): State<AppState>,
    Path(page_code): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let row = sqlx::query(
        "SELECT * FROM sys_page_config WHERE page_code=? AND tenant_id=? AND deleted=0",
    )
    .bind(&page_code)
    .bind(&user.tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    row.map(|r| ApiResponse::success(row_to_json(&r)))
        .ok_or_else(|| AppError::NotFound("page config not found".into()))
}

async fn columns(
    State(state): State<AppState>,
    Path(page_code): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_page_column_config WHERE page_code=? AND tenant_id=? AND deleted=0 ORDER BY order_num ASC",
    )
    .bind(page_code)
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn save(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let page = body
        .get("page")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let columns = body
        .get("columns")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let page_code = page
        .get("pageCode")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let page_name = page
        .get("pageName")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let enabled = bool_to_i64(page.get("enabled").unwrap_or(&Value::Null), 1);
    let sort = page.get("sort").and_then(Value::as_i64).unwrap_or(0);
    let remark = page.get("remark").and_then(Value::as_str);

    let existing: Option<String> =
        sqlx::query_scalar("SELECT page_config_id FROM sys_page_config WHERE page_code=? AND tenant_id=? AND deleted=0")
            .bind(&page_code)
            .bind(&user.tenant_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    if let Some(existing_id) = existing {
        sqlx::query(
            "UPDATE sys_page_config SET page_name=?, enabled=?, sort=?, remark=? WHERE page_config_id=?",
        )
        .bind(&page_name)
        .bind(enabled)
        .bind(sort)
        .bind(remark)
        .bind(existing_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    } else {
        let id = state.snowflake.next_id()?;
        sqlx::query(
            "INSERT INTO sys_page_config (page_config_id, tenant_id, page_code, page_name, enabled, sort, remark, deleted, create_time) VALUES (?,?,?,?,?,?,?,0,NOW())",
        )
        .bind(id)
        .bind(&user.tenant_id)
        .bind(&page_code)
        .bind(&page_name)
        .bind(enabled)
        .bind(sort)
        .bind(remark)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }

    sqlx::query("UPDATE sys_page_column_config SET deleted=1 WHERE page_code=? AND tenant_id=?")
        .bind(&page_code)
        .bind(&user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;

    for column in columns {
        let column_id = column
            .get("columnId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let col_id = if column_id.is_empty() {
            state.snowflake.next_id()?
        } else {
            column_id
        };
        let data_index = column
            .get("dataIndex")
            .and_then(Value::as_str)
            .unwrap_or("");
        let title = column.get("title").and_then(Value::as_str).unwrap_or("");
        let order_num = column.get("orderNum").and_then(Value::as_i64).unwrap_or(0);
        let visible = bool_to_i64(column.get("visible").unwrap_or(&Value::Null), 1);
        let searchable = bool_to_i64(column.get("searchable").unwrap_or(&Value::Null), 0);
        let editable = bool_to_i64(column.get("editable").unwrap_or(&Value::Null), 1);
        let copyable = bool_to_i64(column.get("copyable").unwrap_or(&Value::Null), 0);
        let ellipsis = bool_to_i64(column.get("ellipsis").unwrap_or(&Value::Null), 0);
        let value_type = column.get("valueType").and_then(Value::as_str);
        let value_enum_code = column.get("valueEnumCode").and_then(Value::as_str);
        let placeholder = column.get("placeholder").and_then(Value::as_str);
        let required = bool_to_i64(column.get("required").unwrap_or(&Value::Null), 0);
        sqlx::query(
            "INSERT INTO sys_page_column_config (column_id, tenant_id, page_code, data_index, title, order_num, visible, searchable, editable, copyable, ellipsis, value_type, value_enum_code, placeholder, required, deleted, create_time)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NOW())
             ON DUPLICATE KEY UPDATE page_code=VALUES(page_code), data_index=VALUES(data_index), title=VALUES(title), order_num=VALUES(order_num), visible=VALUES(visible), searchable=VALUES(searchable), editable=VALUES(editable), copyable=VALUES(copyable), ellipsis=VALUES(ellipsis), value_type=VALUES(value_type), value_enum_code=VALUES(value_enum_code), placeholder=VALUES(placeholder), required=VALUES(required), tenant_id=VALUES(tenant_id), deleted=0",
        )
        .bind(col_id)
        .bind(&user.tenant_id)
        .bind(&page_code)
        .bind(data_index)
        .bind(title)
        .bind(order_num)
        .bind(visible)
        .bind(searchable)
        .bind(editable)
        .bind(copyable)
        .bind(ellipsis)
        .bind(value_type)
        .bind(value_enum_code)
        .bind(placeholder)
        .bind(required)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }
    Ok(ApiResponse::message_only("saved"))
}

async fn delete_page(
    State(state): State<AppState>,
    Path(page_code): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("UPDATE sys_page_config SET deleted=1 WHERE page_code=? AND tenant_id=?")
        .bind(&page_code)
        .bind(&user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    sqlx::query("UPDATE sys_page_column_config SET deleted=1 WHERE page_code=? AND tenant_id=?")
        .bind(page_code)
        .bind(&user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("deleted"))
}
