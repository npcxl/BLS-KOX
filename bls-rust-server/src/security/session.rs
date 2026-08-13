use redis::AsyncCommands;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub session_id: String,
    pub user_id: String,
    pub tenant_id: String,
    pub access_jti: String,
    pub refresh_jti: String,
    pub ip: String,
    pub user_agent: String,
    pub login_time: i64,
    pub last_active_time: i64,
    pub status: String,
    pub refresh_token_hash: String,
}

pub struct SessionCenter;

impl SessionCenter {
    fn key(prefix: &str, tenant_id: &str, user_id: &str, session_id: &str) -> String {
        format!("{}session:{}:{}:{}", prefix, tenant_id, user_id, session_id)
    }

    fn index_key(prefix: &str, tenant_id: &str, user_id: &str) -> String {
        format!("{}session-index:{}:{}", prefix, tenant_id, user_id)
    }

    pub async fn create(
        state: &AppState,
        session: &UserSession,
        ttl_seconds: u64,
    ) -> AppResult<()> {
        let Some(client) = &state.redis else {
            return Ok(());
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let key = Self::key(
            &state.config.redis.key_prefix,
            &session.tenant_id,
            &session.user_id,
            &session.session_id,
        );
        let json = serde_json::to_string(session)?;
        let _: () = conn.set_ex(&key, json, ttl_seconds).await?;
        let index = Self::index_key(
            &state.config.redis.key_prefix,
            &session.tenant_id,
            &session.user_id,
        );
        let _: () = conn.sadd(&index, &session.session_id).await?;
        let _: () = conn.expire(&index, ttl_seconds as i64).await?;
        Ok(())
    }

    pub async fn get(
        state: &AppState,
        tenant_id: &str,
        user_id: &str,
        session_id: &str,
    ) -> AppResult<Option<UserSession>> {
        let Some(client) = &state.redis else {
            return Ok(None);
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let key = Self::key(
            &state.config.redis.key_prefix,
            tenant_id,
            user_id,
            session_id,
        );
        let raw = conn.get::<_, Option<String>>(&key).await?;
        Ok(raw.and_then(|raw| serde_json::from_str::<UserSession>(&raw).ok()))
    }

    pub async fn validate(
        state: &AppState,
        tenant_id: &str,
        user_id: &str,
        session_id: &str,
    ) -> bool {
        Self::get(state, tenant_id, user_id, session_id)
            .await
            .ok()
            .flatten()
            .map(|session| session.status == "active")
            .unwrap_or(false)
    }

    pub async fn list(
        state: &AppState,
        tenant_id: &str,
        user_id: &str,
    ) -> AppResult<Vec<UserSession>> {
        let Some(client) = &state.redis else {
            return Ok(Vec::new());
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let index = Self::index_key(&state.config.redis.key_prefix, tenant_id, user_id);
        let ids: Vec<String> = conn.smembers(&index).await?;
        let mut sessions = Vec::new();
        for id in ids {
            let key = Self::key(&state.config.redis.key_prefix, tenant_id, user_id, &id);
            let Some(raw) = conn.get::<_, Option<String>>(&key).await? else {
                continue;
            };
            if let Ok(session) = serde_json::from_str::<UserSession>(&raw) {
                sessions.push(session);
            }
        }
        sessions.sort_by(|a, b| b.last_active_time.cmp(&a.last_active_time));
        Ok(sessions)
    }

    pub async fn revoke(
        state: &AppState,
        tenant_id: &str,
        user_id: &str,
        session_id: &str,
    ) -> AppResult<()> {
        let Some(client) = &state.redis else {
            return Ok(());
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let key = Self::key(
            &state.config.redis.key_prefix,
            tenant_id,
            user_id,
            session_id,
        );
        let _: () = conn.del(&key).await?;
        let index = Self::index_key(&state.config.redis.key_prefix, tenant_id, user_id);
        let _: () = conn.srem(&index, session_id).await?;
        Ok(())
    }

    pub async fn revoke_all(state: &AppState, tenant_id: &str, user_id: &str) -> AppResult<()> {
        let Some(client) = &state.redis else {
            return Ok(());
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let index = Self::index_key(&state.config.redis.key_prefix, tenant_id, user_id);
        let ids: Vec<String> = conn.smembers(&index).await?;
        for id in ids {
            let key = Self::key(&state.config.redis.key_prefix, tenant_id, user_id, &id);
            let _: () = conn.del(&key).await?;
        }
        let _: () = conn.del(&index).await?;
        Ok(())
    }
}
