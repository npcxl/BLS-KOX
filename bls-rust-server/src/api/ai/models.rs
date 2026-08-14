//! GET /api/ai/models — 获取可用 AI 模型列表（优先配置表，fallback 环境变量）

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::query::row_to_json;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/models", get(models))
}

async fn models(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    // 优先从 ai_model_config 表读取
    let rows = sqlx::query(
        "SELECT config_id, model_name, model_type, provider, model_id, is_default, status \
         FROM ai_model_config WHERE deleted = 0 ORDER BY sort_num ASC",
    )
    .fetch_all(&state.db)
    .await;

    if let Ok(rows) = rows {
        if !rows.is_empty() {
            let enabled: Vec<Value> = rows
                .iter()
                .map(row_to_json)
                .filter(|r| r.get("status").and_then(|s| s.as_str()) != Some("1"))
                .collect();

            if !enabled.is_empty() {
                let default_cfg = enabled
                    .iter()
                    .find(|c| c.get("isDefault").and_then(|s| s.as_str()) == Some("1"))
                    .or_else(|| enabled.first())
                    .cloned();

                let models: Vec<Value> = enabled
                    .iter()
                    .map(|c| {
                        json!({
                            "value": c.get("modelId").and_then(|v| v.as_str()).unwrap_or(""),
                            "label": c.get("modelName").and_then(|v| v.as_str()).unwrap_or(""),
                            "modelType": c.get("modelType").and_then(|v| v.as_str()).unwrap_or("api"),
                            "provider": c.get("provider").and_then(|v| v.as_str()).unwrap_or(""),
                        })
                    })
                    .collect();

                let provider = default_cfg
                    .as_ref()
                    .and_then(|c| c.get("provider"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&state.config.ai.provider)
                    .to_string();
                let current_model = default_cfg
                    .as_ref()
                    .and_then(|c| c.get("modelId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&state.config.ai.model)
                    .to_string();

                return Ok(ApiResponse::success(json!({
                    "provider": provider,
                    "currentModel": current_model,
                    "models": models,
                })));
            }
        }
    }

    // fallback 环境变量
    let models = vec![json!({
        "value": state.config.ai.model,
        "label": format!("{} {}", state.config.ai.provider.to_uppercase(), state.config.ai.model),
        "modelType": "api",
        "provider": state.config.ai.provider,
    })];
    Ok(ApiResponse::success(json!({
        "provider": state.config.ai.provider,
        "currentModel": state.config.ai.model,
        "models": models,
    })))
}
