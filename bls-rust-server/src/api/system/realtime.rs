use axum::Router;
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde::Deserialize;

use crate::auth::jwt;
use crate::state::AppState;

#[derive(Deserialize, Default)]
pub struct WsQuery {
    pub token: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(ws_handler))
}

pub async fn ws_handler(
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(token) = query.token.as_deref() else {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    };
    if jwt::verify_access(token, &state.config.jwt.secret).is_err() {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }
    ws.on_upgrade(move |socket| crate::services::websocket::handle_socket(socket, state))
}
