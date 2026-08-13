use redis::AsyncCommands;
use uuid::Uuid;

use crate::error::AppResult;
use crate::state::AppState;

pub struct DistributedLock;

impl DistributedLock {
    pub async fn acquire(
        state: &AppState,
        key: &str,
        ttl_seconds: i64,
    ) -> AppResult<Option<String>> {
        let Some(client) = &state.redis else {
            return Ok(Some(Uuid::new_v4().to_string()));
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let token = Uuid::new_v4().to_string();
        let full = format!("{}lock:{}", state.config.redis.key_prefix, key);
        let acquired: bool = conn.set_nx(&full, &token).await?;
        if acquired {
            let _: () = conn.expire(&full, ttl_seconds).await?;
            Ok(Some(token))
        } else {
            Ok(None)
        }
    }

    pub async fn release(state: &AppState, key: &str, token: &str) -> AppResult<()> {
        let Some(client) = &state.redis else {
            return Ok(());
        };
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let full = format!("{}lock:{}", state.config.redis.key_prefix, key);
        let current: Option<String> = conn.get(&full).await?;
        if current.as_deref() == Some(token) {
            let _: () = conn.del(&full).await?;
        }
        Ok(())
    }
}
