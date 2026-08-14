use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::Value;

use crate::api_response::{ApiResponse, PageResponse};
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
    perm_prefix: None,
    soft_delete: true,
    status_field: true,
    tenant_scoped: true,
};

pub fn router() -> Router<AppState> {
    crud_router(SPEC).route("/internal-list", get(internal_list))
}

async fn internal_list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<PageResponse<Value>, AppError> {
    let secret = headers
        .get("X-Internal-Secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if state.config.internal_secret.is_empty() || secret != state.config.internal_secret {
        return Err(AppError::Forbidden("Forbidden".into()));
    }

    let rows = sqlx::query("SELECT * FROM ai_model_config WHERE deleted = 0 ORDER BY sort_num ASC")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    let total = rows.len() as u64;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), total))
}
