use axum::body::{Body, to_bytes};
use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use redis::AsyncCommands;

use crate::state::AppState;
use crate::utils::signature::hmac_sha256_hex;

const NONCE_WINDOW_SECONDS: i64 = 300;

pub async fn openapi_auth(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let headers = request.headers().clone();
    let api_key = header(&headers, "X-Api-Key");
    let timestamp = header(&headers, "X-Timestamp");
    let nonce = header(&headers, "X-Nonce");
    let signature = header(&headers, "X-Signature");
    if api_key.is_none() || timestamp.is_none() || nonce.is_none() || signature.is_none() {
        return unauthorized("Missing openapi auth headers");
    }

    let timestamp = timestamp.unwrap();
    let nonce = nonce.unwrap();
    let signature = signature.unwrap();
    let now = chrono::Utc::now().timestamp();
    let Ok(ts) = timestamp.parse::<i64>() else {
        return unauthorized("Timestamp expired or invalid");
    };
    if (now - ts).abs() > NONCE_WINDOW_SECONDS {
        return unauthorized("Timestamp expired or invalid");
    }

    if let Some(client) = &state.redis {
        let mut conn = match client.get_multiplexed_tokio_connection().await {
            Ok(conn) => conn,
            Err(_) => return unauthorized("Redis unavailable"),
        };
        let nonce_key = format!("{}openapi:nonce:{}", state.config.redis.key_prefix, nonce);
        let exists: bool = match conn.exists(&nonce_key).await {
            Ok(v) => v,
            Err(_) => return unauthorized("Redis unavailable"),
        };
        if exists {
            return unauthorized("Nonce already used");
        }
        let _: Result<(), redis::RedisError> = conn
            .set_ex(&nonce_key, "1", NONCE_WINDOW_SECONDS as u64)
            .await;
    }

    let secret: Option<String> = sqlx::query_scalar(
        "SELECT api_secret FROM sys_api_key WHERE api_key = ? AND status = '0' AND deleted = 0",
    )
    .bind(api_key.unwrap())
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let Some(secret) = secret else {
        return (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({"code":403,"message":"Invalid API Key"})),
        )
            .into_response();
    };

    let (parts, body) = request.into_parts();
    let body_bytes = match to_bytes(body, 10 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => return unauthorized("Request body too large"),
    };
    let body_text = String::from_utf8_lossy(&body_bytes);
    let method = parts.method.as_str().to_ascii_uppercase();
    let path = parts.uri.path().to_string();
    let sign_str = format!("{method}:{path}:{timestamp}:{nonce}:{body_text}");
    let expected = hmac_sha256_hex(&secret, &sign_str);
    if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
        return (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({"code":403,"message":"Invalid signature"})),
        )
            .into_response();
    }

    let request = Request::from_parts(parts, Body::from(body_bytes));
    next.run(request).await
}

fn header(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned)
}

fn unauthorized(message: &str) -> Response {
    (
        axum::http::StatusCode::UNAUTHORIZED,
        axum::Json(serde_json::json!({"code":401,"message":message})),
    )
        .into_response()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}
