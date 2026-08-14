use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::crud::{CrudSpec, crud_router};
use crate::error::AppError;
use crate::state::AppState;

const SPEC: CrudSpec = CrudSpec {
    prefix: "package",
    table: "sys_package",
    pk: "package_id",
    name: "套餐",
    search_fields: &["package_name"],
    writable_fields: &["package_name", "package_code", "status", "remark"],
    perm_prefix: Some("system:package"),
    soft_delete: false,
    status_field: true,
    tenant_scoped: false,
};

pub fn router() -> Router<AppState> {
    crud_router(SPEC)
        .route("/options", get(options))
        .route("/{packageId}/menus", get(get_menus).put(put_menus))
}

async fn options(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query("SELECT package_id, package_name FROM sys_package WHERE status='0' ORDER BY create_time ASC")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(
        crate::db::query::rows_to_json(rows),
    )))
}

async fn get_menus(
    State(state): State<AppState>,
    Path(package_id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Vec<String>>, AppError> {
    let ids: Vec<String> =
        sqlx::query_scalar("SELECT menu_id FROM sys_package_menu WHERE package_id = ?")
            .bind(package_id)
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(ApiResponse::success(ids))
}

async fn put_menus(
    State(state): State<AppState>,
    Path(package_id): Path<String>,
    _user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let menu_ids: Vec<String> = body
        .get("menuIds")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    sqlx::query("DELETE FROM sys_package_menu WHERE package_id = ?")
        .bind(&package_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    for menu_id in menu_ids {
        sqlx::query("INSERT INTO sys_package_menu (package_id, menu_id) VALUES (?, ?)")
            .bind(&package_id)
            .bind(&menu_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
    }
    Ok(ApiResponse::message_only("分配成功"))
}
