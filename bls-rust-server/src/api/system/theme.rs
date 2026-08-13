use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::db::crud::{CrudSpec, crud_router};
use crate::error::AppError;
use crate::state::AppState;

const SPEC: CrudSpec = CrudSpec {
    prefix: "theme",
    table: "sys_theme_config",
    pk: "theme_id",
    name: "主题配置",
    search_fields: &["title", "nav_theme"],
    writable_fields: &[
        "nav_theme",
        "color_primary",
        "layout",
        "content_width",
        "fixed_header",
        "fix_siderbar",
        "color_weak",
        "split_menus",
        "sider_menu_type",
        "title",
        "logo",
        "iconfont_url",
        "token_json",
        "status",
        "remark",
    ],
    perm_prefix: Some("system:theme"),
    soft_delete: true,
    status_field: true,
    tenant_scoped: true,
};

pub fn router() -> Router<AppState> {
    crud_router(SPEC).route("/current", get(current))
}

async fn current(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    let row = sqlx::query(
        "SELECT * FROM sys_theme_config WHERE status='0' AND deleted=0 AND tenant_id='000000' ORDER BY create_time DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let value = row
        .map(|r| crate::db::query::row_to_json(&r))
        .unwrap_or(json!({}));
    Ok(ApiResponse::success(value))
}
