use axum::extract::{Path, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::services::ai_provider;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/completions", post(completions))
        .route("/conversations", get(list).post(create))
        .route("/conversations/{id}", put(rename).delete(remove))
        .route("/conversations/{id}/messages", get(messages))
}

/// POST /api/ai/chat/completions — OpenAI 兼容的 SSE 流式对话
async fn completions(
    State(state): State<AppState>,
    _user: AuthUser,
    Json(body): Json<ai_provider::AiCompletionRequest>,
) -> Result<axum::response::Sse<impl futures_util::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>, AppError> {
    if body.messages.is_empty() {
        return Err(AppError::BadRequest("缺少 messages 参数".into()));
    }
    let config = state.config.ai.clone();
    ai_provider::stream_completions(config, body).await
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM ai_conversation WHERE user_id=? AND deleted=0 ORDER BY updated_at DESC LIMIT 50",
    )
    .bind(&user.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    // id 为雪花 ID 字符串（与 Koa 后端对齐）
    let conv_id = body
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.snowflake.next_id().unwrap_or_default());

    let title = body
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("新对话")
        .trim()
        .to_string();
    let title = if title.is_empty() {
        "新对话".to_string()
    } else {
        title
    };

    let existing: Option<String> = sqlx::query_scalar("SELECT id FROM ai_conversation WHERE id = ?")
        .bind(&conv_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    if existing.is_some() {
        sqlx::query("UPDATE ai_conversation SET title=?, updated_at=NOW() WHERE id=?")
            .bind(&title)
            .bind(&conv_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
    } else {
        sqlx::query(
            "INSERT INTO ai_conversation (id, user_id, tenant_id, title, deleted, created_at, updated_at) VALUES (?,?,?,?,0,NOW(),NOW())",
        )
        .bind(&conv_id)
        .bind(&user.user_id)
        .bind(&user.tenant_id)
        .bind(&title)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }

    if let Some(messages) = body.get("messages").and_then(Value::as_array) {
        for msg in messages {
            let role = msg.get("role").and_then(Value::as_str).unwrap_or("user");
            let content = msg.get("content").and_then(Value::as_str).unwrap_or("");
            let msg_id = state.snowflake.next_id().unwrap_or_default();
            sqlx::query(
                "INSERT INTO ai_conversation_message (id, conversation_id, role, content, deleted, created_at) VALUES (?,?,?,?,0,NOW())",
            )
            .bind(&msg_id)
            .bind(&conv_id)
            .bind(role)
            .bind(content)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
        }
    }

    Ok(ApiResponse::success(json!({"id": conv_id, "title": title})))
}

async fn rename(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let title = body
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }
    sqlx::query("UPDATE ai_conversation SET title=?, updated_at=NOW() WHERE id=? AND user_id=?")
        .bind(&title)
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(json!({"id": id, "title": title})))
}

async fn remove(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("UPDATE ai_conversation SET deleted=1 WHERE id=? AND user_id=?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("deleted"))
}

async fn messages(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM ai_conversation_message WHERE conversation_id=? AND deleted=0 ORDER BY created_at ASC LIMIT 200",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

#[allow(dead_code)]
fn _row_to_json(row: sqlx::mysql::MySqlRow) -> Value {
    row_to_json(&row)
}
