use std::collections::HashMap;

use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;
use crate::utils::pagination::PageParams;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/report", post(report))
        .route("/list", get(list))
        .route("/stats", get(stats))
}

async fn report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let secret = headers
        .get("X-Internal-Secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if state.config.internal_secret.is_empty() || secret != state.config.internal_secret {
        return Err(AppError::Forbidden("Forbidden".into()));
    }
    let usage_id = state.snowflake.next_id()?;
    sqlx::query(
        "INSERT INTO sys_ai_usage (usage_id, tenant_id, user_id, username, model_name, provider, endpoint, prompt_tokens, completion_tokens, total_tokens, estimated_cost, elapsed_ms, success, stream_mode, error_msg, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
    )
    .bind(usage_id)
    .bind(body.get("tenantId").and_then(Value::as_str).unwrap_or("000000"))
    .bind(body.get("userId").and_then(Value::as_str))
    .bind(body.get("username").and_then(Value::as_str))
    .bind(body.get("modelName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("provider").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("endpoint").and_then(Value::as_str).unwrap_or("chat"))
    .bind(body.get("promptTokens").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("completionTokens").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("totalTokens").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("cost").or_else(|| body.get("estimatedCost")).and_then(Value::as_f64).unwrap_or(0.0))
    .bind(body.get("elapsedMs").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("success").and_then(Value::as_bool).map(|b| b as i64).or_else(|| body.get("success").and_then(Value::as_i64)).unwrap_or(1))
    .bind(body.get("streamMode").and_then(Value::as_bool).map(|b| b as i64).or_else(|| body.get("streamMode").and_then(Value::as_i64)).unwrap_or(0))
    .bind(body.get("errorMsg").and_then(Value::as_str))
    .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("上报成功"))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<PageParams>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    let limit = q.page_size.clamp(1, 100);
    let offset = (q.page_num.max(1) - 1) * limit;
    let rows = sqlx::query(
        "SELECT * FROM sys_ai_usage WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(&user.tenant_id)
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_ai_usage WHERE tenant_id = ?")
        .bind(&user.tenant_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    let values = crate::db::query::rows_to_json(rows)
        .into_iter()
        .map(|mut v| {
            if let Some(obj) = v.as_object_mut() {
                for key in ["estimatedCost", "promptTokens", "completionTokens", "totalTokens", "elapsedMs"] {
                    if let Some(num) = obj.get(key).and_then(Value::as_str).and_then(|s| s.parse::<f64>().ok()) {
                        obj.insert(key.to_string(), serde_json::Number::from_f64(num).map(Value::Number).unwrap_or(Value::Null));
                    }
                }
            }
            v
        })
        .collect();
    Ok(PageResponse::success(Value::Array(values), total as u64))
}

async fn stats(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let days = q
        .get("days")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(7)
        .clamp(1, 90);
    let start = (chrono::Utc::now() - chrono::Duration::days(days))
        .format("%Y-%m-%d")
        .to_string();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let today_row: (i64, i64, f64, f64) = sqlx::query_as(
        "SELECT COUNT(*), CAST(COALESCE(SUM(total_tokens),0) AS SIGNED), CAST(COALESCE(SUM(estimated_cost),0) AS DOUBLE), CAST(COALESCE(AVG(elapsed_ms),0) AS DOUBLE)
         FROM sys_ai_usage WHERE tenant_id = ? AND created_at >= ? AND success = 1",
    )
    .bind(&user.tenant_id)
    .bind(&today)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;

    let daily: Vec<(String, i64, i64, f64)> = sqlx::query_as(
        "SELECT LEFT(created_at,10), COUNT(*), CAST(COALESCE(SUM(total_tokens),0) AS SIGNED), CAST(COALESCE(SUM(estimated_cost),0) AS DOUBLE)
         FROM sys_ai_usage WHERE tenant_id = ? AND created_at >= ? GROUP BY LEFT(created_at,10) ORDER BY LEFT(created_at,10) ASC",
    )
    .bind(&user.tenant_id)
    .bind(&start)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;

    let models: Vec<(String, i64, i64, f64, f64)> = sqlx::query_as(
        "SELECT model_name, COUNT(*), CAST(COALESCE(SUM(total_tokens),0) AS SIGNED), CAST(COALESCE(SUM(estimated_cost),0) AS DOUBLE), CAST(COALESCE(AVG(elapsed_ms),0) AS DOUBLE)
         FROM sys_ai_usage WHERE tenant_id = ? AND created_at >= ? AND success = 1 GROUP BY model_name ORDER BY SUM(total_tokens) DESC",
    )
    .bind(&user.tenant_id)
    .bind(&start)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;

    let endpoints: Vec<(String, i64, i64, f64)> = sqlx::query_as(
        "SELECT endpoint, COUNT(*), CAST(COALESCE(SUM(total_tokens),0) AS SIGNED), CAST(COALESCE(SUM(estimated_cost),0) AS DOUBLE)
         FROM sys_ai_usage WHERE tenant_id = ? AND created_at >= ? AND success = 1 GROUP BY endpoint ORDER BY SUM(total_tokens) DESC",
    )
    .bind(&user.tenant_id)
    .bind(&start)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;

    let users: Vec<(Option<String>, Option<String>, i64, i64, f64)> = sqlx::query_as(
        "SELECT username, user_id, COUNT(*), CAST(COALESCE(SUM(total_tokens),0) AS SIGNED), CAST(COALESCE(SUM(estimated_cost),0) AS DOUBLE)
         FROM sys_ai_usage WHERE tenant_id = ? AND created_at >= ? AND success = 1 GROUP BY username, user_id ORDER BY SUM(total_tokens) DESC LIMIT 10",
    )
    .bind(&user.tenant_id)
    .bind(&start)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(ApiResponse::success(json!({
        "today": {
            "count": today_row.0,
            "totalTokens": today_row.1,
            "totalCost": today_row.2,
            "avgElapsedMs": today_row.3.round() as i64,
        },
        "dailyTrend": daily.into_iter().map(|(dt, cnt, tk, cost)| json!({
            "date": dt,
            "count": cnt,
            "totalTokens": tk,
            "totalCost": cost,
        })).collect::<Vec<_>>(),
        "modelStats": models.into_iter().map(|(model_name, cnt, tk, cost, avg_ms)| json!({
            "modelName": model_name,
            "count": cnt,
            "totalTokens": tk,
            "totalCost": cost,
            "avgElapsedMs": avg_ms.round() as i64,
        })).collect::<Vec<_>>(),
        "endpointStats": endpoints.into_iter().map(|(endpoint, cnt, tk, cost)| json!({
            "endpoint": endpoint,
            "count": cnt,
            "totalTokens": tk,
            "totalCost": cost,
        })).collect::<Vec<_>>(),
        "userStats": users.into_iter().map(|(username, user_id, cnt, tk, cost)| json!({
            "username": username.unwrap_or_else(|| "??".to_string()),
            "userId": user_id.unwrap_or_default(),
            "count": cnt,
            "totalTokens": tk,
            "totalCost": cost,
        })).collect::<Vec<_>>(),
    })))
}
