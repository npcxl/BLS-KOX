use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde_json::json;

pub async fn handle_error(request: Request<Body>, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status() != StatusCode::NOT_FOUND {
        return response;
    }
    (
        StatusCode::NOT_FOUND,
        axum::Json(json!({"code": 404, "message": "?????"})),
    )
        .into_response()
}
