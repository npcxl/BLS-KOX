use redis::AsyncCommands;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub async fn check_rate_limit(
    state: &AppState,
    key: &str,
    limit: u64,
    window_seconds: u64,
) -> AppResult<()> {
    let Some(client) = &state.redis else {
        return Ok(());
    };
    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(AppError::from)?;
    let redis_key = format!("{}rate:{}", state.config.redis.key_prefix, key);
    let count: u64 = conn.incr(&redis_key, 1).await.map_err(AppError::from)?;
    if count == 1 {
        let _: () = conn
            .expire(&redis_key, window_seconds as i64)
            .await
            .map_err(AppError::from)?;
    }
    if count > limit {
        return Err(AppError::TooManyRequests("请求过于频繁，请稍后再试".into()));
    }
    Ok(())
}
