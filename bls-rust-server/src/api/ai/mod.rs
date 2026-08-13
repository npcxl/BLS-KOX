pub mod chat;

use crate::state::AppState;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().nest("/chat", chat::router())
}
