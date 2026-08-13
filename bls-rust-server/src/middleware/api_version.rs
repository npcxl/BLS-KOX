use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::state::AppState;

pub async fn api_version_headers(
    State(_state): State<AppState>,
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    if path.starts_with("/api/") && !path.starts_with("/api/v1/") {
        let response = next.run(request).await;
        let mut response = response;
        response
            .headers_mut()
            .insert("Deprecation", "true".parse().unwrap());
        response
            .headers_mut()
            .insert("Sunset", "Mon, 01 Jan 2027 00:00:00 GMT".parse().unwrap());
        response
    } else {
        next.run(request).await
    }
}
