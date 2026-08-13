pub mod api;
pub mod api_response;
pub mod auth;
pub mod config;
pub mod db;
pub mod distributed;
pub mod error;
pub mod middleware;
pub mod observability;
pub mod outbox;
pub mod queue;
pub mod security;
pub mod services;
pub mod state;
pub mod utils;

use axum::body::Body;
use axum::http::{StatusCode, header};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use state::AppState;
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;

pub fn app(state: AppState) -> Router<()> {
    build_router(state.clone()).with_state(state)
}

fn build_router(state: AppState) -> Router<AppState> {
    let api = api::routes().layer(axum::middleware::from_fn_with_state(
        state.clone(),
        middleware::replay::replay,
    ));
    let openapi = api::routes().layer(axum::middleware::from_fn_with_state(
        state.clone(),
        middleware::openapi_auth::openapi_auth,
    ));
    let internal = internal_routes().layer(axum::middleware::from_fn_with_state(
        state.clone(),
        middleware::internal_auth::internal_auth,
    ));

    Router::new()
        .nest("/api", api.clone())
        .nest("/api/v1", api)
        .nest("/openapi/v1", openapi)
        .merge(internal)
        .route("/api/health", get(health))
        .route("/api/ready", get(ready))
        .route("/api/metrics", get(metrics))
        .route("/api/docs", get(docs))
        .route("/api/openapi.json", get(openapi_json))
        .route("/ws/realtime", get(api::system::realtime::ws_handler))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::http_metrics::http_metrics,
        ))
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
}

fn internal_routes() -> Router<AppState> {
    Router::new()
        .route("/internal/health", get(internal_health))
        .route("/internal/ready", get(internal_ready))
        .route("/internal/metrics", get(metrics))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn ready() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ready" }))
}

async fn internal_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn internal_ready() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ready" }))
}

async fn metrics() -> impl IntoResponse {
    match observability::metrics::metrics_text() {
        Ok(text) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
            text,
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "text/plain")],
            err.to_string(),
        )
            .into_response(),
    }
}

async fn docs() -> Html<&'static str> {
    Html(
        r##"<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>BLS-KOX API</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script><script>SwaggerUIBundle({url:"/api/openapi.json",dom_id:"#swagger-ui",presets:[SwaggerUIBundle.presets.apis,SwaggerUIStandalonePreset],layout:"StandaloneLayout"});</script></body></html>"##,
    )
}

async fn openapi_json() -> Response {
    Json(serde_json::json!({
        "openapi": "3.0.3",
        "info": { "title": "BLS-KOX API", "version": "0.1.0" },
        "paths": {
            "/api/health": { "get": { "responses": { "200": { "description": "ok" } } } },
            "/api/ready": { "get": { "responses": { "200": { "description": "ready" } } } }
        }
    }))
    .into_response()
}

fn _assert_body(_body: Body) {}
