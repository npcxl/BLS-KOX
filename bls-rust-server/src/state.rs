use reqwest::Client;
use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
use std::sync::Arc;

use crate::config::Config;
use crate::utils::snowflake::SnowflakeGenerator;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: MySqlPool,
    pub redis: Option<redis::Client>,
    pub http: Client,
    pub snowflake: Arc<SnowflakeGenerator>,
}

fn unquote_env(value: &str) -> String {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        value[1..value.len() - 1].to_string()
    } else {
        value.to_string()
    }
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let url = format!(
            "mysql://{}:{}@{}:{}/{}?charset=utf8mb4&ssl-mode=required",
            config.db.user, config.db.password, config.db.host, config.db.port, config.db.database
        );
        let db = MySqlPoolOptions::new()
            .max_connections(config.db.max_connections)
            // 连接空闲超过 5 分钟则关闭，避免复用被服务端 wait_timeout 关闭的坏连接
            // （否则会出现 "Malformed communication packet" 错误）
            .idle_timeout(std::time::Duration::from_secs(300))
            .max_lifetime(std::time::Duration::from_secs(1800))
            .connect(&url)
            .await?;

        let redis = if config.redis.enabled {
            let info = redis::ConnectionInfo {
                addr: redis::ConnectionAddr::Tcp(config.redis.host.clone(), config.redis.port),
                redis: redis::RedisConnectionInfo {
                    db: 0,
                    username: config.redis.username.as_deref().map(unquote_env),
                    password: config.redis.password.as_deref().map(unquote_env),
                    protocol: redis::ProtocolVersion::RESP2,
                },
            };
            let client = redis::Client::open(info)?;
            Some(client)
        } else {
            None
        };

        Ok(Self {
            config: Arc::new(config),
            db,
            redis,
            http: Client::new(),
            snowflake: Arc::new(SnowflakeGenerator::new(1, 1)?),
        })
    }
}
