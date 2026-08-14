use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde_json::{Value, json};
use std::collections::HashMap;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;
use redis::AsyncCommands;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(stats))
        .route("/rules", get(rules))
        .route("/events", get(events))
        .route("/blacklist", get(blacklist).post(add_blacklist))
        .route("/blacklist/{id}", delete(remove_blacklist))
}

async fn stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:security:stats")?;
    let recent: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sys_security_log WHERE create_time >= NOW() - INTERVAL 24 HOUR",
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let perm_blocked: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sys_ip_blacklist WHERE status = '0'")
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    let mut temp_blocked = 0u64;
    if let Some(client) = &state.redis {
        if let Ok(mut conn) = client.get_multiplexed_tokio_connection().await {
            if let Ok(keys) = conn.keys::<_, Vec<String>>("security:blocked_ip:*").await {
                temp_blocked = keys.len() as u64;
            }
        }
    }

    let by_risk_rows = sqlx::query(
        "SELECT risk_level, COUNT(*) AS cnt FROM sys_security_log WHERE create_time >= NOW() - INTERVAL 24 HOUR GROUP BY risk_level",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut by_risk = serde_json::Map::new();
    for row in by_risk_rows {
        let v = crate::db::query::row_to_json(&row);
        if let Some(Value::Number(n)) = v.get("cnt") {
            if let Some(key) = v.get("riskLevel").and_then(Value::as_str) {
                by_risk.insert(key.to_string(), Value::Number(n.clone()));
            }
        }
    }

    Ok(ApiResponse::success(json!({
        "recentEvents": recent,
        "tempBlockedIps": temp_blocked,
        "permBlockedIps": perm_blocked,
        "byRisk": Value::Object(by_risk),
    })))
}

async fn rules(
    State(_state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:security:stats")?;
    Ok(ApiResponse::success(json!([
        {"id":"rule_login_brute_force","name":"login brute force","eventTypes":["LOGIN_FAILED"],"threshold":20,"windowSeconds":300,"riskLevel":2,"actions":["BLOCK_IP","LOCK_ACCOUNT"],"weight":8},
        {"id":"rule_refresh_reuse","name":"refresh token reuse","eventTypes":["REFRESH_TOKEN_REUSE"],"threshold":1,"windowSeconds":3600,"riskLevel":3,"actions":["REVOKE_ALL_SESSIONS"],"weight":10},
        {"id":"rule_cross_tenant","name":"cross tenant access","eventTypes":["CROSS_TENANT_ACCESS"],"threshold":1,"windowSeconds":3600,"riskLevel":3,"actions":["ALERT_ONLY"],"weight":9},
        {"id":"rule_signature_invalid","name":"signature invalid","eventTypes":["SIGNATURE_INVALID"],"threshold":5,"windowSeconds":60,"riskLevel":2,"actions":["BLOCK_IP"],"weight":7},
        {"id":"rule_replay_attack","name":"replay attack","eventTypes":["NONCE_REPLAY","REPLAY_DETECTED"],"threshold":10,"windowSeconds":60,"riskLevel":2,"actions":["BLOCK_IP"],"weight":8},
        {"id":"rule_rate_limit","name":"rate limit","eventTypes":["RATE_LIMIT_EXCEEDED"],"threshold":50,"windowSeconds":60,"riskLevel":1,"actions":["ALERT_ONLY"],"weight":4}
    ])))
}

async fn events(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:security:stats")?;
    let mut filter_sql = String::from(" WHERE 1=1");
    let mut binds: Vec<String> = Vec::new();

    if let Some(v) = q.get("eventType").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND event_type = ?");
        binds.push(v.clone());
    }
    if let Some(v) = q.get("riskLevel").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND risk_level = ?");
        binds.push(v.clone());
    }
    if let Some(v) = q.get("username").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND username LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.get("clientIp").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND client_ip = ?");
        binds.push(v.clone());
    }
    if let Some(v) = q.get("keyword").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND (title LIKE ? OR detail LIKE ?)");
        binds.push(format!("%{v}%"));
        binds.push(format!("%{v}%"));
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_security_log{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q
        .get("pageNum")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1)
        .max(1);
    let page_size = q
        .get("pageSize")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(20)
        .clamp(1, 100);
    let offset = (page_num - 1) * page_size;

    let sql = format!(
        "SELECT * FROM sys_security_log{filter_sql} ORDER BY create_time DESC LIMIT ? OFFSET ?"
    );
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;

    Ok(PageResponse::success(
        Value::Array(crate::db::query::rows_to_json(rows)),
        total as u64,
    ))
}

async fn blacklist(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:security:stats")?;
    let mut filter_sql = String::from(" WHERE status = '0'");
    let mut binds: Vec<String> = Vec::new();

    if let Some(v) = q.get("ip").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND ip_address LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.get("source").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND source = ?");
        binds.push(v.clone());
    }

    let count_sql = format!("SELECT COUNT(*) FROM sys_ip_blacklist{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let page_num = q
        .get("pageNum")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1)
        .max(1);
    let page_size = q
        .get("pageSize")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(20)
        .clamp(1, 100);
    let offset = (page_num - 1) * page_size;

    let sql = format!(
        "SELECT * FROM sys_ip_blacklist{filter_sql} ORDER BY create_time DESC LIMIT ? OFFSET ?"
    );
    let mut query = sqlx::query(&sql);
    for b in binds {
        query = query.bind(b);
    }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;

    Ok(PageResponse::success(
        Value::Array(crate::db::query::rows_to_json(rows)),
        total as u64,
    ))
}

async fn add_blacklist(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:security:blacklist:add")?;
    let ip = body
        .get("ipAddress")
        .or_else(|| body.get("ip"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if ip.is_empty() {
        return Err(AppError::BadRequest("ip address is required".into()));
    }

    let reason = body.get("reason").and_then(Value::as_str).unwrap_or("");
    let expire_at = body.get("expireAt").and_then(Value::as_str);
    let id = state.snowflake.next_id()?;
    sqlx::query(
        "INSERT INTO sys_ip_blacklist (id, ip_address, reason, source, status, expire_at, tenant_id, create_by, create_time) VALUES (?, ?, ?, 'manual', '0', ?, ?, ?, NOW())",
    )
    .bind(id)
    .bind(&ip)
    .bind(reason)
    .bind(body.get("expireAt").and_then(Value::as_str))
    .bind(&user.tenant_id)
    .bind(&user.username)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    if let Some(client) = &state.redis {
        if let Ok(mut conn) = client.get_multiplexed_tokio_connection().await {
            let ttl_seconds = expire_at
                .and_then(|v| {
                    chrono::DateTime::parse_from_rfc3339(v)
                        .ok()
                        .map(|dt| (dt.timestamp() - chrono::Utc::now().timestamp()).max(1))
                        .or_else(|| {
                            chrono::NaiveDateTime::parse_from_str(v, "%Y-%m-%d %H:%M:%S")
                                .ok()
                                .map(|dt| (dt.and_utc().timestamp() - chrono::Utc::now().timestamp()).max(1))
                        })
                })
                .unwrap_or(3600);
            let _: () = conn
                .set_ex(format!("security:blocked_ip:{ip}"), "1", ttl_seconds as u64)
                .await
                .unwrap_or(());
        }
    }

    Ok(ApiResponse::message_only("ip blacklisted"))
}

async fn remove_blacklist(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:security:blacklist:remove")?;
    let ip: Option<String> =
        sqlx::query_scalar("SELECT ip_address FROM sys_ip_blacklist WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    sqlx::query("UPDATE sys_ip_blacklist SET status = '1' WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    if let (Some(ip), Some(client)) = (ip, &state.redis) {
        if let Ok(mut conn) = client.get_multiplexed_tokio_connection().await {
            let _: () = conn.del(format!("security:blocked_ip:{ip}")).await.unwrap_or(());
        }
    }
    Ok(ApiResponse::message_only("ip removed"))
}
