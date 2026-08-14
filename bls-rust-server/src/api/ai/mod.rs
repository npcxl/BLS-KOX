pub mod chat;
pub mod models;

use crate::state::AppState;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/chat", chat::router())
        .merge(models::router())
}
