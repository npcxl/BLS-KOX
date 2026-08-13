use std::time::Instant;

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::state::AppState;

pub async fn http_metrics(
    State(_state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = request.method().to_string();
    let path = normalize_path(request.uri().path());
    let start = Instant::now();
    let response = next.run(request).await;
    let status = response.status().as_u16().to_string();
    crate::observability::metrics::http_requests_total()
        .with_label_values(&[&method, &path, &status])
        .inc();
    crate::observability::metrics::http_request_duration_seconds()
        .with_label_values(&[&method, &path])
        .observe(start.elapsed().as_secs_f64());
    response
}

fn normalize_path(path: &str) -> String {
    if path.starts_with("/api/system/") || path.starts_with("/api/v1/system/") {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() > 4 {
            return parts[..4].join("/");
        }
    }
    path.to_string()
}
