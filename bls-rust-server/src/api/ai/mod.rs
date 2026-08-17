pub mod chat;

use crate::state::AppState;
use axum::Router;

/// /api/ai 下仅保留对话管理（conversations CRUD）。
/// AI 流式对话 / 模型列表等能力由 bls-ai-service 微服务（7201）提供，
/// 由前端 proxy / nginx 分流，主后端不实现。
pub fn router() -> Router<AppState> {
    Router::new().nest("/chat", chat::router())
}
