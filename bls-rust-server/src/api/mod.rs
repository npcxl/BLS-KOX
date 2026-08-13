pub mod ai;
pub mod auth;
pub mod common;
pub mod system;

use crate::state::AppState;
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .nest("/system", system::router())
        .nest("/ai", ai::router())
        .nest("/common", common::router())
        .nest("/ops", system::ops_release::router())
}

pub fn router(state: AppState) -> Router<()> {
    routes().with_state(state)
}
