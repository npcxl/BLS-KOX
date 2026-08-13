use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::state::AppState;
use crate::utils::signature::sha256_hex;

pub async fn internal_auth(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let headers = request.headers();
    let token = headers
        .get("X-Internal-Token")
        .and_then(|v| v.to_str().ok())
        .or_else(|| {
            headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
        });
    let expected = sha256_hex(&state.config.internal_secret);
    let Some(token) = token else {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({"code":401,"message":"Missing internal token"})),
        )
            .into_response();
    };
    if sha256_hex(token) != expected {
        return (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({"code":403,"message":"Invalid internal token"})),
        )
            .into_response();
    }
    next.run(request).await
}
