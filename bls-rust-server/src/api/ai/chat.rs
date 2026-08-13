use axum::extract::{Path, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/conversations", get(list).post(create))
        .route("/conversations/{id}", put(rename).delete(remove))
        .route("/conversations/{id}/messages", get(messages))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM ai_conversation WHERE tenant_id=? AND user_id=? AND deleted=0 ORDER BY updated_at DESC LIMIT 50",
    )
    .bind(&user.tenant_id)
    .bind(&user.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let provided_id = body.get("id").and_then(Value::as_i64).or_else(|| {
        body.get("id")
            .and_then(Value::as_str)
            .and_then(|s| s.parse::<i64>().ok())
    });
    let conv_id = provided_id.unwrap_or_else(|| {
        state
            .snowflake
            .next_id()
            .unwrap_or_default()
            .parse::<i64>()
            .unwrap_or(0)
    });
    let title = body
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("New conversation")
        .trim()
        .to_string();
    let title = if title.is_empty() {
        "New conversation".to_string()
    } else {
        title
    };

    let existing: Option<i64> = sqlx::query_scalar("SELECT id FROM ai_conversation WHERE id = ?")
        .bind(conv_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    if existing.is_some() {
        sqlx::query("UPDATE ai_conversation SET title=?, updated_at=NOW() WHERE id=?")
            .bind(&title)
            .bind(conv_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
    } else {
        sqlx::query(
            "INSERT INTO ai_conversation (id, user_id, tenant_id, title, deleted, created_at, updated_at) VALUES (?,?,?,?,0,NOW(),NOW())",
        )
        .bind(conv_id)
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
            let msg_id = state
                .snowflake
                .next_id()
                .unwrap_or_default()
                .parse::<i64>()
                .unwrap_or(0);
            sqlx::query(
                "INSERT INTO ai_conversation_message (id, conversation_id, role, content, deleted, created_at) VALUES (?,?,?,?,0,NOW())",
            )
            .bind(msg_id)
            .bind(conv_id)
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
    Path(id): Path<i64>,
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
        .bind(id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(json!({"id": id, "title": title})))
}

async fn remove(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    sqlx::query("UPDATE ai_conversation SET deleted=1 WHERE id=? AND user_id=?")
        .bind(id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("deleted"))
}

async fn messages(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    _user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM ai_conversation_message WHERE conversation_id=? AND deleted=0 ORDER BY created_at ASC LIMIT 200",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(PageResponse::success(Value::Array(rows_to_json(rows)), 0))
}

#[allow(dead_code)]
fn _row_to_json(row: sqlx::mysql::MySqlRow) -> Value {
    row_to_json(&row)
}
