use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::api_response::ApiResponse;
use crate::auth::password::verify_password;
use crate::auth::{AuthUser, jwt};
use crate::db::query::row_to_json;
use crate::error::{AppError, AppResult};
use crate::security::event_center::write_security_log;
use crate::security::session::{SessionCenter, UserSession};
use crate::state::AppState;
use crate::utils::domain::extract_domain;
use crate::utils::menu_tree::build_tree;
use crate::utils::request_meta::extract_ip;
use crate::utils::signature::sha256_hex;

const SESSION_PREFIX: &str = "auth:session:";
const REFRESH_PREFIX: &str = "auth:refresh:";
const REFRESH_USED_PREFIX: &str = "auth:refresh-used:";
const REFRESH_META_PREFIX: &str = "auth:refresh-meta:";
const LEGACY_USER_SESSIONS_PREFIX: &str = "auth:user-sessions:";
const DEFAULT_REFRESH_TTL: u64 = 7 * 24 * 60 * 60;

#[derive(Deserialize)]
pub struct LoginBody {
    pub username: String,
    pub password: String,
    #[serde(default, alias = "tenantId")]
    pub tenant_id: Option<String>,
    #[serde(default, alias = "domainName")]
    pub domain_name: Option<String>,
}

#[derive(Deserialize)]
pub struct RefreshBody {
    #[serde(default, alias = "refreshToken")]
    pub refresh_token: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/refresh", post(refresh))
        .route("/auth/logout", post(logout))
        .route("/auth/profile", get(profile))
}

fn session_key(jti: &str) -> String {
    format!("{SESSION_PREFIX}{jti}")
}

fn refresh_key(jti: &str) -> String {
    format!("{REFRESH_PREFIX}{jti}")
}

fn refresh_used_key(jti: &str) -> String {
    format!("{REFRESH_USED_PREFIX}{jti}")
}

fn refresh_meta_key(jti: &str) -> String {
    format!("{REFRESH_META_PREFIX}{jti}")
}

fn legacy_user_sessions_key(user_id: &str) -> String {
    format!("{LEGACY_USER_SESSIONS_PREFIX}{user_id}")
}

fn parse_bool(value: &str) -> bool {
    let value = value.trim();
    !(value == "0" || value.eq_ignore_ascii_case("false"))
}

async fn redis_set(state: &AppState, key: &str, value: &str, ttl: u64) -> AppResult<()> {
    if let Some(client) = &state.redis {
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let _: () = conn.set_ex(key, value, ttl).await?;
    }
    Ok(())
}

async fn redis_get(state: &AppState, key: &str) -> AppResult<Option<String>> {
    let Some(client) = &state.redis else {
        return Ok(None);
    };
    let mut conn = client.get_multiplexed_tokio_connection().await?;
    Ok(conn.get(key).await?)
}

async fn redis_del(state: &AppState, key: &str) -> AppResult<()> {
    if let Some(client) = &state.redis {
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let _: () = conn.del(key).await?;
    }
    Ok(())
}

async fn redis_exists(state: &AppState, key: &str) -> AppResult<bool> {
    let Some(client) = &state.redis else {
        return Ok(false);
    };
    let mut conn = client.get_multiplexed_tokio_connection().await?;
    Ok(conn.exists(key).await?)
}

async fn redis_sadd(state: &AppState, key: &str, value: &str) -> AppResult<()> {
    if let Some(client) = &state.redis {
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let _: () = conn.sadd(key, value).await?;
    }
    Ok(())
}

async fn redis_expire(state: &AppState, key: &str, ttl: u64) -> AppResult<()> {
    if let Some(client) = &state.redis {
        let mut conn = client.get_multiplexed_tokio_connection().await?;
        let _: () = conn.expire(key, ttl as i64).await?;
    }
    Ok(())
}

async fn resolve_tenant(
    state: &AppState,
    domain: &str,
    fallback_tenant: Option<&str>,
) -> AppResult<String> {
    if let Some(tenant_id) = sqlx::query_scalar::<_, String>(
        "SELECT tenant_id FROM sys_tenant WHERE domain_name = ? AND status = '0' AND deleted = 0 LIMIT 1",
    )
    .bind(domain)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?
    {
        return Ok(tenant_id);
    }

    if domain == "localhost" || domain == "127.0.0.1" || domain == "::1" {
        if let Some(tenant_id) = sqlx::query_scalar::<_, String>(
            "SELECT tenant_id FROM sys_tenant WHERE tenant_id = '000000' AND status = '0' AND deleted = 0 LIMIT 1",
        )
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?
        {
            return Ok(tenant_id);
        }
    }

    if let Some(tenant_id) = fallback_tenant.filter(|s| !s.trim().is_empty()) {
        return Ok(tenant_id.to_string());
    }

    Err(AppError::Unauthorized("?????????".into()))
}

async fn is_multi_login_enabled(state: &AppState, tenant_id: &str) -> AppResult<bool> {
    let value = sqlx::query_scalar::<_, String>(
        "SELECT config_value FROM sys_config WHERE config_key = 'sys.login.multiDevice' AND tenant_id = ? AND status = '0' ORDER BY create_time DESC LIMIT 1",
    )
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(value.as_deref().map(parse_bool).unwrap_or(true))
}

async fn load_perms(state: &AppState, user_id: &str, tenant_id: &str) -> AppResult<Vec<String>> {
    if tenant_id == "000000" {
        return Ok(vec!["*".to_string()]);
    }
    let perms = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT m.perms FROM sys_user_role ur
         JOIN sys_role_menu rm ON rm.role_id = ur.role_id
         JOIN sys_menu m ON m.menu_id = rm.menu_id
         WHERE ur.user_id = ? AND m.perms IS NOT NULL AND m.perms <> ''",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(perms)
}

async fn build_profile(state: &AppState, user_id: &str, tenant_id: &str) -> AppResult<Value> {
    let row = sqlx::query(
        "SELECT user_id, tenant_id, username, nickname, real_name, avatar, gender, email, phone, dept_id, is_admin, status
         FROM sys_user WHERE user_id = ? AND tenant_id = ? AND deleted = 0",
    )
    .bind(user_id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?
    .ok_or_else(|| AppError::Unauthorized("?????".into()))?;

    let mut profile = row_to_json(&row);

    let roles = sqlx::query(
        "SELECT r.role_key AS roleKey, r.data_scope AS dataScope
         FROM sys_role r
         JOIN sys_user_role ur ON r.role_id = ur.role_id
         WHERE ur.user_id = ? AND r.status = '0' AND r.deleted = 0",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let roles = roles.iter().map(row_to_json).collect::<Vec<_>>();

    let perms = load_perms(state, user_id, tenant_id).await?;

    let menus = sqlx::query(
        "SELECT DISTINCT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
                m.path, m.component, m.icon, m.menu_type AS menuType, m.sort_num AS sortNum
         FROM sys_role_menu rm
         JOIN sys_menu m ON rm.menu_id = m.menu_id
         JOIN sys_user_role ur ON rm.role_id = ur.role_id
         WHERE ur.user_id = ? AND m.menu_type IN ('0','1') AND m.status = '0'
         ORDER BY m.sort_num ASC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let menu_rows = menus.iter().map(row_to_json).collect::<Vec<_>>();
    let menu_tree = build_tree(menu_rows, "parentId", "menuId");

    if let Some(obj) = profile.as_object_mut() {
        obj.insert("permissions".to_string(), json!(perms));
        obj.insert("roles".to_string(), Value::Array(roles));
        obj.insert("menus".to_string(), Value::Array(menu_tree));
    }

    Ok(profile)
}

fn make_session(
    session_id: String,
    user_id: String,
    tenant_id: String,
    access_jti: String,
    refresh_jti: String,
    ip: String,
    user_agent: String,
    refresh_token_hash: String,
) -> UserSession {
    let now = chrono::Utc::now().timestamp();
    UserSession {
        session_id,
        user_id,
        tenant_id,
        access_jti,
        refresh_jti,
        ip,
        user_agent,
        login_time: now,
        last_active_time: now,
        status: "active".to_string(),
        refresh_token_hash,
    }
}

async fn create_auth_session(
    state: &AppState,
    user_id: &str,
    tenant_id: &str,
    access_jti: &str,
    refresh_jti: &str,
    ip: &str,
    user_agent: &str,
    refresh_token: &str,
) -> AppResult<()> {
    let refresh_hash = sha256_hex(refresh_token);
    let access_ttl = 15 * 60;
    let refresh_ttl = DEFAULT_REFRESH_TTL;

    let stored = json!({
        "userId": user_id,
        "tenantId": tenant_id,
        "accessJti": access_jti,
        "refreshJti": refresh_jti,
        "refreshHash": refresh_hash,
    });

    redis_set(
        state,
        &session_key(access_jti),
        &stored.to_string(),
        access_ttl,
    )
    .await?;
    redis_set(state, &refresh_key(refresh_jti), &refresh_hash, refresh_ttl).await?;
    redis_set(
        state,
        &refresh_meta_key(refresh_jti),
        &stored.to_string(),
        refresh_ttl,
    )
    .await?;

    let session = make_session(
        format!("acc:{access_jti}"),
        user_id.to_string(),
        tenant_id.to_string(),
        access_jti.to_string(),
        refresh_jti.to_string(),
        ip.to_string(),
        user_agent.to_string(),
        refresh_hash.clone(),
    );
    SessionCenter::create(state, &session, refresh_ttl).await?;

    let refresh_session = make_session(
        format!("ref:{refresh_jti}"),
        user_id.to_string(),
        tenant_id.to_string(),
        access_jti.to_string(),
        refresh_jti.to_string(),
        ip.to_string(),
        user_agent.to_string(),
        refresh_hash,
    );
    SessionCenter::create(state, &refresh_session, refresh_ttl).await?;

    redis_sadd(state, &legacy_user_sessions_key(user_id), access_jti).await?;
    redis_expire(state, &legacy_user_sessions_key(user_id), refresh_ttl).await?;
    Ok(())
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> Result<ApiResponse<Value>, AppError> {
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok());
    let domain = body
        .domain_name
        .clone()
        .or_else(|| Some(extract_domain(origin)))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "localhost".to_string());
    let tenant_id = resolve_tenant(&state, &domain, body.tenant_id.as_deref()).await?;

    let row: Option<(String, String, String, String, String, String)> = sqlx::query_as(
        "SELECT user_id, tenant_id, username, password, password_algorithm, status
         FROM sys_user WHERE username = ? AND tenant_id = ? AND deleted = 0",
    )
    .bind(&body.username)
    .bind(&tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;

    let Some((user_id, actual_tenant_id, username, hash, algorithm, status)) = row else {
        return Err(AppError::Unauthorized("????????".into()));
    };
    if !verify_password(&body.password, &hash, &algorithm) {
        return Err(AppError::Unauthorized("????????".into()));
    }
    if status == "1" {
        return Err(AppError::Unauthorized("??????".into()));
    }

    let profile = build_profile(&state, &user_id, &actual_tenant_id).await?;
    let perms = load_perms(&state, &user_id, &actual_tenant_id).await?;
    let access_token = jwt::sign_access(
        &user_id,
        &actual_tenant_id,
        &username,
        perms.clone(),
        &state.config.jwt.secret,
    )?;
    let refresh_token = jwt::sign_refresh(
        &user_id,
        &actual_tenant_id,
        &username,
        perms,
        &state.config.jwt.secret,
    )?;

    let access_claims = jwt::verify_access(
        access_token
            .strip_prefix("Bearer ")
            .unwrap_or(&access_token),
        &state.config.jwt.secret,
    )?;
    let refresh_claims = jwt::verify_refresh(&refresh_token, &state.config.jwt.secret)?;

    let multi_login = is_multi_login_enabled(&state, &actual_tenant_id).await?;
    if !multi_login {
        SessionCenter::revoke_all(&state, &actual_tenant_id, &user_id).await?;
        redis_del(&state, &legacy_user_sessions_key(&user_id)).await?;
    }

    let ip = extract_ip(
        headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()),
        None,
    );
    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    create_auth_session(
        &state,
        &user_id,
        &actual_tenant_id,
        &access_claims.jti,
        &refresh_claims.jti,
        &ip,
        user_agent,
        &refresh_token,
    )
    .await?;

    Ok(ApiResponse::success(json!({
        "token": access_token,
        "refreshToken": refresh_token,
        "user": profile,
    })))
}

async fn profile(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    Ok(ApiResponse::success(
        build_profile(&state, &user.user_id, &user.tenant_id).await?,
    ))
}

async fn logout(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let stored_raw = redis_get(&state, &session_key(&user.jti)).await?;
    if let Some(raw) = stored_raw {
        if let Ok(stored) = serde_json::from_str::<Value>(&raw) {
            let refresh_jti = stored
                .get("refreshJti")
                .and_then(Value::as_str)
                .unwrap_or_default();
            redis_del(&state, &session_key(&user.jti)).await?;
            if !refresh_jti.is_empty() {
                redis_del(&state, &refresh_key(refresh_jti)).await?;
                redis_del(&state, &refresh_meta_key(refresh_jti)).await?;
                SessionCenter::revoke(
                    &state,
                    &user.tenant_id,
                    &user.user_id,
                    &format!("ref:{refresh_jti}"),
                )
                .await?;
            }
        }
    }
    SessionCenter::revoke(
        &state,
        &user.tenant_id,
        &user.user_id,
        &format!("acc:{}", user.jti),
    )
    .await?;
    Ok(ApiResponse::message_only("????"))
}

async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshBody>,
) -> Result<ApiResponse<Value>, AppError> {
    if body.refresh_token.trim().is_empty() {
        return Err(AppError::BadRequest("??refreshToken".into()));
    }

    let claims = jwt::verify_refresh(&body.refresh_token, &state.config.jwt.secret)
        .map_err(|_| AppError::Unauthorized("refreshToken??".into()))?;

    if state.redis.is_none() {
        return Err(AppError::Internal(anyhow::anyhow!("Redis???")));
    }

    let stored_hash = redis_get(&state, &refresh_key(&claims.jti)).await?;
    let expected_hash = sha256_hex(&body.refresh_token);
    if stored_hash.as_deref() != Some(expected_hash.as_str()) {
        let used_key = refresh_used_key(&claims.jti);
        let was_used = redis_exists(&state, &used_key).await?;
        if was_used {
            let _ = write_security_log(
                &state.db,
                &claims.tenant_id,
                "REFRESH_TOKEN_REUSE",
                3,
                Some(&claims.username),
                None,
                None,
                None,
                &format!("Refresh Token ?????{}", claims.username),
                Some(json!({
                    "userId": claims.user_id,
                    "tenantId": claims.tenant_id,
                    "jti": claims.jti,
                })),
            )
            .await;
            SessionCenter::revoke_all(&state, &claims.tenant_id, &claims.user_id).await?;
        }
        return Err(AppError::Unauthorized("refreshToken??".into()));
    }

    redis_set(
        &state,
        &refresh_used_key(&claims.jti),
        "1",
        DEFAULT_REFRESH_TTL,
    )
    .await?;

    let user_row: Option<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT user_id, tenant_id, username, nickname FROM sys_user WHERE user_id = ? AND deleted = 0",
    )
    .bind(&claims.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;

    let Some((user_id, tenant_id, username, _nickname)) = user_row else {
        return Err(AppError::Unauthorized("?????".into()));
    };

    let perms = load_perms(&state, &user_id, &tenant_id).await?;
    let new_access_token = jwt::sign_access(
        &user_id,
        &tenant_id,
        &username,
        perms.clone(),
        &state.config.jwt.secret,
    )?;
    let new_refresh_token = jwt::sign_refresh(
        &user_id,
        &tenant_id,
        &username,
        perms,
        &state.config.jwt.secret,
    )?;

    let new_access_claims = jwt::verify_access(
        new_access_token
            .strip_prefix("Bearer ")
            .unwrap_or(&new_access_token),
        &state.config.jwt.secret,
    )?;
    let new_refresh_claims = jwt::verify_refresh(&new_refresh_token, &state.config.jwt.secret)?;

    if let Some(raw) = redis_get(&state, &refresh_meta_key(&claims.jti)).await? {
        if let Ok(meta) = serde_json::from_str::<Value>(&raw) {
            let old_access_jti = meta
                .get("accessJti")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !old_access_jti.is_empty() {
                redis_del(&state, &session_key(old_access_jti)).await?;
                SessionCenter::revoke(
                    &state,
                    &tenant_id,
                    &user_id,
                    &format!("acc:{old_access_jti}"),
                )
                .await?;
            }
        }
    }
    redis_del(&state, &refresh_key(&claims.jti)).await?;
    redis_del(&state, &refresh_meta_key(&claims.jti)).await?;
    SessionCenter::revoke(&state, &tenant_id, &user_id, &format!("ref:{}", claims.jti)).await?;

    let ip = "unknown".to_string();
    let user_agent = "unknown".to_string();
    create_auth_session(
        &state,
        &user_id,
        &tenant_id,
        &new_access_claims.jti,
        &new_refresh_claims.jti,
        &ip,
        &user_agent,
        &new_refresh_token,
    )
    .await?;

    Ok(ApiResponse::success(json!({
        "token": new_access_token,
        "refreshToken": new_refresh_token,
    })))
}
