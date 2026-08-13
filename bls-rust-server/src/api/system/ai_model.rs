use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::Value;

use crate::api_response::ApiResponse;
use crate::db::crud::{CrudSpec, crud_router};
use crate::db::query::rows_to_json;
use crate::error::AppError;
use crate::state::AppState;

const SPEC: CrudSpec = CrudSpec {
    prefix: "ai-model",
    table: "ai_model_config",
    pk: "config_id",
    name: "AI model config",
    search_fields: &["model_name", "model_id"],
    writable_fields: &[
        "model_name",
        "model_type",
        "provider",
        "model_id",
        "api_key",
        "base_url",
        "temperature",
        "max_tokens",
        "timeout_ms",
        "is_default",
        "status",
        "sort_num",
        "remark",
    ],
    perm_prefix: Some("system:ai-model"),
    soft_delete: true,
    status_field: true,
    tenant_scoped: true,
};

pub fn router() -> Router<AppState> {
    crud_router(SPEC).route("/internal-list", get(internal_list))
}

async fn internal_list(State(state): State<AppState>) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query("SELECT * FROM ai_model_config WHERE status = '0' AND deleted = 0")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}
