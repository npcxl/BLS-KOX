use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::crud::{CrudSpec, crud_router};
use crate::db::query::row_to_json;
use crate::error::AppError;
use crate::state::AppState;

const SPEC: CrudSpec = CrudSpec {
    prefix: "config",
    table: "sys_config",
    pk: "config_id",
    name: "系统参数",
    search_fields: &["config_name", "config_key"],
    writable_fields: &[
        "config_name",
        "config_key",
        "config_value",
        "config_type",
        "status",
        "remark",
    ],
    perm_prefix: Some("system:config"),
    soft_delete: false,
    status_field: true,
    tenant_scoped: true,
};

pub fn router() -> Router<AppState> {
    crud_router(SPEC)
        .route("/public-system", get(public_system))
        .route("/public-theme", get(public_theme))
        .route("/current", get(current))
}

async fn fetch_system_configs(state: &AppState) -> Result<Vec<Value>, AppError> {
    let keys = [
        "sys.app.name",
        "sys.demo.enabled",
        "sys.upload.maxSize",
        "sys.version",
        "sys.app.logo",
        "sys.user.defaultAvatar",
        "sys.user.defaultPassword",
    ];
    let mut rows = Vec::new();
    for key in keys {
        let row = sqlx::query(
            "SELECT * FROM sys_config WHERE config_key=? AND deleted=0 AND (tenant_id='000000' OR tenant_id='100000') ORDER BY tenant_id DESC LIMIT 1",
        )
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
        if let Some(row) = row {
            rows.push(row_to_json(&row));
        }
    }
    Ok(rows)
}

async fn public_system(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    Ok(ApiResponse::success(Value::Array(
        fetch_system_configs(&state).await?,
    )))
}

async fn public_theme(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    let row = sqlx::query(
        "SELECT * FROM sys_config WHERE config_key='theme.default' AND status='0' AND deleted=0 ORDER BY tenant_id DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(
        row.map(|r| row_to_json(&r)).unwrap_or(json!({})),
    ))
}

async fn current(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    Ok(ApiResponse::success(Value::Array(
        fetch_system_configs(&state).await?,
    )))
}
