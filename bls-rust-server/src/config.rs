use serde::Deserialize;
use std::env;

fn env_str(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .map(|v| v == "true" || v == "1")
        .unwrap_or(default)
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[derive(Debug, Clone)]
pub struct Config {
    pub env_name: String,
    pub is_production: bool,
    pub port: u16,
    pub host: String,
    pub trust_proxy: bool,
    pub cors_origins: Vec<String>,
    pub db: DbConfig,
    pub redis: RedisConfig,
    pub jwt: JwtConfig,
    pub replay: ReplayConfig,
    pub internal_secret: String,
    pub event_service: EventServiceConfig,
    pub ws: WsConfig,
    pub upload_dir: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub base_url: String,
    pub timeout_ms: u64,
    pub temperature: f32,
}

#[derive(Debug, Clone)]
pub struct DbConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone)]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub enabled: bool,
    pub key_prefix: String,
}

#[derive(Debug, Clone)]
pub struct JwtConfig {
    pub secret: String,
    pub expires_in: String,
    pub refresh_expires_in: String,
}

#[derive(Debug, Clone)]
pub struct ReplayConfig {
    pub enabled: bool,
    pub sign_secret: String,
    pub window_seconds: u64,
    pub nonce_ttl_seconds: u64,
    pub default_mode: String,
}

#[derive(Debug, Clone)]
pub struct EventServiceConfig {
    pub url: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone)]
pub struct WsConfig {
    pub enabled: bool,
    pub path: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let _ = dotenvy::dotenv();
        let env_name = env_str("NODE_ENV", "development");
        let is_production = env_name == "production";
        let jwt_secret = env_str("JWT_SECRET", "please_change_me_dev_only");
        if is_production && jwt_secret == "please_change_me_dev_only" {
            anyhow::bail!("JWT_SECRET must be configured in production");
        }
        let internal_secret = env_str("INTERNAL_SECRET", "");
        if is_production && internal_secret.is_empty() {
            anyhow::bail!("INTERNAL_SECRET must be configured in production");
        }
        let db_password = env_str("DB_PASSWORD", "");
        if is_production && db_password.starts_with("CHANGE_TO_") {
            anyhow::bail!("DB_PASSWORD must not use a CHANGE_TO_ placeholder");
        }

        Ok(Self {
            env_name,
            is_production,
            port: env_u16("APP_PORT", env_u16("PORT", 6002)),
            host: env_str("APP_HOST", "0.0.0.0"),
            trust_proxy: env_bool("TRUST_PROXY", false),
            cors_origins: env_str("CORS_ORIGINS", "*")
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            db: DbConfig {
                host: env_str("DB_HOST", "127.0.0.1"),
                port: env_u16("DB_PORT", 3306),
                user: env_str("DB_USER", "root"),
                password: db_password,
                database: env_str("DB_NAME", &env_str("DB_DATABASE", "bls")),
                max_connections: env_usize("DB_CONNECTION_LIMIT", 10) as u32,
            },
            redis: RedisConfig {
                host: env_str("REDIS_HOST", "127.0.0.1"),
                port: env_u16("REDIS_PORT", 6379),
                username: env::var("REDIS_USERNAME").ok().filter(|s| !s.is_empty()),
                password: env::var("REDIS_PASSWORD").ok().filter(|s| !s.is_empty()),
                enabled: env_bool("REDIS_ENABLED", true),
                key_prefix: env_str("REDIS_KEY_PREFIX", "bls:"),
            },
            jwt: JwtConfig {
                secret: jwt_secret,
                expires_in: env_str("JWT_EXPIRES_IN", "15m"),
                refresh_expires_in: env_str("JWT_REFRESH_EXPIRES_IN", "7d"),
            },
            replay: ReplayConfig {
                enabled: env_bool("REPLAY_ENABLED", true),
                sign_secret: env_str("API_SIGN_SECRET", ""),
                window_seconds: env_usize("REPLAY_WINDOW_SECONDS", 120) as u64,
                nonce_ttl_seconds: env_usize("REPLAY_NONCE_TTL_SECONDS", 180) as u64,
                default_mode: env_str("REPLAY_DEFAULT_MODE", "nonce"),
            },
            internal_secret,
            event_service: {
                let url = env::var("EVENT_SERVICE_URL").ok().filter(|s| !s.is_empty());
                EventServiceConfig {
                    enabled: url.is_some(),
                    url,
                }
            },
            ws: WsConfig {
                enabled: env_bool("WS_ENABLED", true),
                path: env_str("WS_PATH", "/ws/realtime"),
            },
            upload_dir: env_str("UPLOAD_DIR", "./uploads"),
            ai: AiConfig {
                provider: env_str("AI_PROVIDER", "deepseek"),
                model: env_str("AI_MODEL", "deepseek-chat"),
                api_key: env_str("OPENAI_API_KEY", "ollama"),
                base_url: env_str("AI_BASE_URL", ""),
                timeout_ms: env_usize("AI_TIMEOUT_MS", 60_000) as u64,
                temperature: 0.3,
            },
        })
    }
}
