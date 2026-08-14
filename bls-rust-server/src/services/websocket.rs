use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;

use crate::auth::jwt;
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
    // 对齐 Koa 后端：连接建立后等待客户端发送 { type: 'auth', token } 消息鉴权
    // 首次握手后，等待客户端发送 auth 消息（或超时断开）
    let auth_deadline = tokio::time::sleep(Duration::from_secs(10));
    tokio::pin!(auth_deadline);

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let parsed: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        if parsed.get("type").and_then(|v| v.as_str()) == Some("auth") {
                            let token = parsed.get("token").and_then(|v| v.as_str()).unwrap_or("");
                            if jwt::verify_access(token, &state.config.jwt.secret).is_ok() {
                                break;
                            } else {
                                // 鉴权失败：关闭连接（对齐 Koa 的 1008 auth failed）
                                let _ = socket.send(Message::Close(Some(axum::extract::ws::CloseFrame {
                                    code: 1008,
                                    reason: "auth failed".into(),
                                }))).await;
                                return;
                            }
                        }
                        // 未鉴权前的其他消息忽略
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => return,
                    Some(Err(_)) => return,
                    _ => {}
                }
            }
            _ = &mut auth_deadline => {
                // 超时未鉴权：关闭连接
                let _ = socket.send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 1008,
                    reason: "auth timeout".into(),
                }))).await;
                return;
            }
        }
    }

    // 鉴权成功：返回实时信息，进入广播循环
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
