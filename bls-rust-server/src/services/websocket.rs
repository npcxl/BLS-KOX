use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;

use crate::state::AppState;

static BROADCAST: std::sync::OnceLock<broadcast::Sender<String>> = std::sync::OnceLock::new();

fn sender() -> &'static broadcast::Sender<String> {
    BROADCAST.get_or_init(|| {
        let (tx, _) = broadcast::channel(1024);
        tokio::spawn(broadcast_loop(tx.clone()));
        tx
    })
}

async fn broadcast_loop(tx: broadcast::Sender<String>) {
    let mut interval = tokio::time::interval(Duration::from_secs(15));
    loop {
        interval.tick().await;
        let payload = serde_json::json!({
            "type": "realtime-info",
            "data": {
                "serverTime": chrono::Utc::now().to_rfc3339(),
                "memoryUsage": memory_usage(),
            }
        })
        .to_string();
        let _ = tx.send(payload);
    }
}

fn memory_usage() -> f64 {
    0.0
}

pub async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let payload = serde_json::json!({
        "type": "realtime-info",
        "data": {
            "serverTime": chrono::Utc::now().to_rfc3339(),
            "service": "bls-rust-server",
            "port": state.config.port,
        }
    })
    .to_string();
    if socket.send(Message::Text(payload.into())).await.is_err() {
        return;
    }

    let mut rx = sender().subscribe();
    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if socket.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            Ok(text) = rx.recv() => {
                if socket.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }
}
