pub mod ai_model;
pub mod ai_usage;
pub mod config;
pub mod dashboard;
pub mod dept;
pub mod dict;
pub mod global_search;
pub mod job;
pub mod log;
pub mod menu;
pub mod ops_release;
pub mod package;
pub mod page_config;
pub mod realtime;
pub mod role;
pub mod security;
pub mod storage;
pub mod tenant;
pub mod theme;
pub mod user;
pub mod webhook;

use crate::state::AppState;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/user", user::router())
        .nest("/role", role::router())
        .nest("/menu", menu::router())
        .nest("/dept", dept::router())
        .nest("/dict", dict::router())
        .nest("/config", config::router())
        .nest("/tenant", tenant::router())
        .nest("/package", package::router())
        .nest("/theme", theme::router())
        .nest("/log", log::router())
        .nest("/jobs", job::router())
        .nest("/storage", storage::router())
        .nest("/webhooks", webhook::router())
        .nest("/page-config", page_config::router())
        .nest("/global-search", global_search::router())
        .nest("/dashboard", dashboard::router())
        .nest("/security", security::router())
        .nest("/ai-model", ai_model::router())
        .nest("/ai-usage", ai_usage::router())
        .nest("/realtime", realtime::router())
}
