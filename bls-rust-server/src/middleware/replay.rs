use axum::body::{Body, to_bytes};
use axum::extract::{Request, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use redis::AsyncCommands;

use crate::state::AppState;
use crate::utils::signature::hmac_sha256_hex;

pub async fn replay(State(state): State<AppState>, request: Request<Body>, next: Next) -> Response {
    if !state.config.replay.enabled || has_internal_secret(request.headers()) {
        return next.run(request).await;
    }

    let method = request.method().clone();
    let protected = matches!(
        method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );
    if !protected {
        return next.run(request).await;
    }

    let path = request.uri().path().to_string();
    let headers = request.headers().clone();
    let idempotency_key =
        header(&headers, "Idempotency-Key").or_else(|| header(&headers, "X-Idempotent-Key"));
    let timestamp = header(&headers, "X-Timestamp");
    let nonce = header(&headers, "X-Nonce");
    let signature = header(&headers, "X-Signature");

    if timestamp.is_none() || nonce.is_none() {
        return replay_response(
            StatusCode::UNAUTHORIZED,
            40101,
            "Missing timestamp or nonce",
        );
    }

    let timestamp = timestamp.unwrap();
    let nonce = nonce.unwrap();
    let now_ms = chrono::Utc::now().timestamp_millis();
    let Ok(ts) = timestamp.parse::<i64>() else {
        return replay_response(StatusCode::UNAUTHORIZED, 40102, "Invalid timestamp");
    };
    // The web frontend sends Date.now() in milliseconds. Accept both
    // millisecond and second timestamps to match the Koa implementation.
    let ts_ms = if ts > 10_000_000_000 { ts } else { ts * 1000 };
    if (now_ms - ts_ms).abs() > state.config.replay.window_seconds as i64 * 1000 {
        return replay_response(StatusCode::UNAUTHORIZED, 40103, "Timestamp expired");
    }

    if let Some(client) = &state.redis {
        let mut conn = match client.get_multiplexed_tokio_connection().await {
            Ok(conn) => conn,
            Err(_) => {
                return replay_response(StatusCode::SERVICE_UNAVAILABLE, 500, "Redis unavailable");
            }
        };
        let nonce_key = format!("{}replay:nonce:{}", state.config.redis.key_prefix, nonce);
        let acquired: bool = match conn.set_nx(&nonce_key, "1").await {
            Ok(v) => v,
            Err(_) => {
                return replay_response(StatusCode::SERVICE_UNAVAILABLE, 500, "Redis unavailable");
            }
        };
        if !acquired {
            return replay_response(StatusCode::CONFLICT, 40901, "Nonce already used");
        }
        let _: Result<(), redis::RedisError> = conn
            .expire(&nonce_key, state.config.replay.nonce_ttl_seconds as i64)
            .await;
    }

    let sign_required = state.config.replay.default_mode == "signature"
        || !state.config.replay.sign_secret.is_empty();
    if sign_required {
        if signature.is_none() {
            return replay_response(StatusCode::UNAUTHORIZED, 40105, "Missing signature");
        }
    }

    let (parts, body) = request.into_parts();
    let body_bytes = match to_bytes(body, 10 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => return replay_response(StatusCode::BAD_REQUEST, 400, "Request body too large"),
    };

    if let Some(expected) = signature {
        if state.config.replay.sign_secret.is_empty() {
            return replay_response(
                StatusCode::UNAUTHORIZED,
                40105,
                "Signature secret is not configured",
            );
        }
        let body_text = String::from_utf8_lossy(&body_bytes);
        let sign_str = format!("{}:{}:{}:{}:{}", method, path, timestamp, nonce, body_text);
        if !constant_time_eq(
            expected.as_bytes(),
            hmac_sha256_hex(&state.config.replay.sign_secret, &sign_str).as_bytes(),
        ) {
            return replay_response(StatusCode::FORBIDDEN, 40106, "Invalid signature");
        }
    }

    if let Some(key) = idempotency_key {
        if let Some(client) = &state.redis {
            if let Ok(mut conn) = client.get_multiplexed_tokio_connection().await {
                let lock_key = format!("{}idem-lock:{}", state.config.redis.key_prefix, key);
                let acquired: bool = conn.set_nx(&lock_key, "1").await.unwrap_or(false);
                if acquired {
                    let _: Result<(), redis::RedisError> = conn.expire(&lock_key, 30).await;
                }
            }
        }
    }

    let request = Request::from_parts(parts, Body::from(body_bytes));
    next.run(request).await
}

fn has_internal_secret(headers: &HeaderMap) -> bool {
    headers.contains_key("X-Internal-Secret")
}

fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned)
}

fn replay_response(status: StatusCode, code: u16, message: &str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({"code": code, "message": message, "data": null})),
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
