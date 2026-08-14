use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::auth::password::{hash_argon2id, verify_password};
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::security::session::SessionCenter;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct UserQuery {
    #[serde(default = "default_page_num", alias = "pageNum")]
    page_num: u64,
    #[serde(default = "default_page_size", alias = "pageSize")]
    page_size: u64,
    keyword: Option<String>,
    status: Option<String>,
    dept_id: Option<String>,
}

fn default_page_num() -> u64 {
    1
}
fn default_page_size() -> u64 {
    10
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list))
        .route("/profile", get(profile).put(update_profile))
        .route("/add", post(add))
        .route("/edit", put(edit))
        .route("/changePassword", put(change_password))
        .route("/remove", delete(remove))
        .route("/sessions/{userId}", get(sessions))
        .route("/kick", post(kick))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<UserQuery>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:user:list")?;
    let base_from = "FROM sys_user u LEFT JOIN sys_dept d ON u.dept_id = d.dept_id AND u.tenant_id = d.tenant_id WHERE u.deleted = 0";
    let mut filter_sql = String::new();
    let mut filter_binds: Vec<String> = Vec::new();
    filter_sql.push_str(" AND u.tenant_id = ?");
    filter_binds.push(user.tenant_id.clone());
    if let Some(kw) = q.keyword.as_deref().filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND (u.username LIKE ? OR u.nickname LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)");
        for _ in 0..5 {
            filter_binds.push(format!("%{kw}%"));
        }
    }
    if let Some(status) = q.status.as_deref() {
        filter_sql.push_str(" AND u.status = ?");
        filter_binds.push(status.to_string());
    }
    if let Some(dept_id) = q.dept_id.as_deref() {
        filter_sql.push_str(" AND u.dept_id = ?");
        filter_binds.push(dept_id.to_string());
    }

    let count_sql = format!("SELECT COUNT(*) {base_from}{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &filter_binds {
        count_query = count_query.bind(b.clone());
    }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);

    let sql = format!(
        "SELECT u.*, d.dept_name {base_from}{filter_sql} ORDER BY u.create_time DESC LIMIT ? OFFSET ?"
    );
    let mut binds = filter_binds;
    let limit = q.page_size.min(100);
    let offset = (q.page_num.max(1) - 1) * limit;
    binds.push(limit.to_string());
    binds.push(offset.to_string());

    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b.clone());
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    let data = rows_to_json(rows);
    Ok(PageResponse::success(Value::Array(data), total as u64))
}

async fn profile(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    let row =
        sqlx::query("SELECT * FROM sys_user WHERE user_id = ? AND tenant_id = ? AND deleted = 0")
            .bind(&user.user_id)
            .bind(&user.tenant_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(ApiResponse::success(
        row.map(|r| row_to_json(&r)).unwrap_or(json!({})),
    ))
}

async fn update_profile(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let nickname = body.get("nickname").and_then(Value::as_str).unwrap_or("");
    let email = body.get("email").and_then(Value::as_str).unwrap_or("");
    let phone = body.get("phone").and_then(Value::as_str).unwrap_or("");
    let avatar = body.get("avatar").and_then(Value::as_str).unwrap_or("");
    let gender = body.get("gender").and_then(Value::as_str).unwrap_or("");
    let remark = body.get("remark").and_then(Value::as_str).unwrap_or("");
    sqlx::query("UPDATE sys_user SET nickname = ?, email = ?, phone = ?, avatar = ?, gender = ?, remark = ? WHERE user_id = ? AND tenant_id = ?")
        .bind(nickname).bind(email).bind(phone).bind(avatar).bind(gender).bind(remark).bind(&user.user_id).bind(&user.tenant_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("??????"))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:user:add")?;
    let id = state.snowflake.next_id()?;
    let username = body.get("username").and_then(Value::as_str).unwrap_or("");
    let nickname = body
        .get("nickname")
        .and_then(Value::as_str)
        .unwrap_or(username);
    let password = match body.get("password").and_then(Value::as_str) {
        Some(v) => v.to_string(),
        None => {
            sqlx::query_scalar::<_, String>(
                "SELECT config_value FROM sys_config WHERE config_key = 'sys.user.defaultPassword' AND tenant_id = ? AND deleted = 0 LIMIT 1",
            )
            .bind(&user.tenant_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?
            .unwrap_or_else(|| "123456".to_string())
        }
    };
    let hashed = hash_argon2id(&password)?;
    let dept_id = body.get("deptId").and_then(Value::as_str).map(ToOwned::to_owned);
    let real_name = body.get("realName").and_then(Value::as_str).map(ToOwned::to_owned);
    let avatar = body.get("avatar").and_then(Value::as_str).map(ToOwned::to_owned);
    let gender = body.get("gender").and_then(Value::as_str).map(ToOwned::to_owned);
    let phone = body.get("phone").and_then(Value::as_str).map(ToOwned::to_owned);
    let email = body.get("email").and_then(Value::as_str).map(ToOwned::to_owned);
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    let remark = body.get("remark").and_then(Value::as_str).map(ToOwned::to_owned);
    sqlx::query(
        "INSERT INTO sys_user (user_id, tenant_id, username, nickname, password, password_algorithm, dept_id, real_name, avatar, gender, phone, email, status, remark, deleted, create_time)
         VALUES (?, ?, ?, ?, ?, 'argon2id', ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())",
    )
    .bind(id).bind(&user.tenant_id).bind(username).bind(nickname).bind(hashed)
    .bind(dept_id).bind(real_name).bind(avatar).bind(gender).bind(phone).bind(email)
    .bind(status).bind(remark)
    .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("?????"))
}

async fn edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:user:edit")?;
    let user_id = body
        .get("userId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("??? userId".into()))?;
    let fields = [
        ("nickname", "nickname"),
        ("realName", "real_name"),
        ("avatar", "avatar"),
        ("gender", "gender"),
        ("email", "email"),
        ("phone", "phone"),
        ("deptId", "dept_id"),
        ("status", "status"),
        ("remark", "remark"),
    ];
    let mut sets = Vec::new();
    let mut binds: Vec<Value> = Vec::new();
    for (camel, snake) in fields {
        if let Some(v) = body.get(camel) {
            sets.push(format!("{snake} = ?"));
            binds.push(v.clone());
        }
    }
    if sets.is_empty() {
        return Err(AppError::BadRequest("no updatable fields".into()));
    }
    let sql = format!("UPDATE sys_user SET {} WHERE user_id = ? AND tenant_id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    query = query.bind(user_id).bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("??????"))
}

async fn change_password(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    let old_password = body
        .get("oldPassword")
        .and_then(Value::as_str)
        .unwrap_or("");
    let new_password = body
        .get("newPassword")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("缺少新密码".into()))?;
    let (hash, algorithm): (String, String) = sqlx::query_as(
        "SELECT password, password_algorithm FROM sys_user WHERE user_id = ? AND tenant_id = ?",
    )
    .bind(&user.user_id)
    .bind(&user.tenant_id)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if !verify_password(old_password, &hash, &algorithm) {
        return Err(AppError::BadRequest("原密码错误".into()));
    }
    let new_hash = hash_argon2id(new_password)?;
    sqlx::query("UPDATE sys_user SET password = ?, password_algorithm = 'argon2id', password_update_time = NOW() WHERE user_id = ? AND tenant_id = ?")
        .bind(new_hash).bind(&user.user_id).bind(&user.tenant_id).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("密码修改成功"))
}

fn ids_from_body(body: &Value) -> Vec<String> {
    let ids = body
        .get("ids")
        .or_else(|| body.get("idList"))
        .unwrap_or(&Value::Null);
    match ids {
        Value::Array(items) => items
            .iter()
            .filter_map(|v| v.as_str().map(ToOwned::to_owned))
            .collect(),
        Value::String(s) => s
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:user:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "UPDATE sys_user SET deleted = 1 WHERE user_id IN ({placeholders}) AND tenant_id = ?"
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query = query.bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("删除成功"))
}

async fn sessions(
    State(state): State<AppState>,
    Path(target_user_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:user:kick")?;
    let target_exists: Option<String> = sqlx::query_scalar(
        "SELECT user_id FROM sys_user WHERE user_id = ? AND tenant_id = ? AND deleted = 0",
    )
    .bind(&target_user_id)
    .bind(&user.tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    if target_exists.is_none() {
        return Err(AppError::NotFound("?????".into()));
    }

    let sessions = SessionCenter::list(&state, &user.tenant_id, &target_user_id).await?;
    let active = sessions
        .into_iter()
        .filter(|s| s.status == "active" && s.session_id.starts_with("acc:"))
        .map(|s| {
            serde_json::json!({
                "sessionId": s.session_id,
                "deviceId": s.access_jti,
                "ip": s.ip,
                "userAgent": s.user_agent,
                "loginTime": chrono::DateTime::from_timestamp_millis(s.login_time)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
                "lastActiveTime": chrono::DateTime::from_timestamp_millis(s.last_active_time)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();

    let online = !active.is_empty();
    Ok(ApiResponse::success(serde_json::json!({
        "userId": target_user_id,
        "activeSessions": active,
        "online": online,
    })))
}

async fn kick(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:user:kick")?;
    let user_ids = body
        .get("userIds")
        .or_else(|| body.get("ids"))
        .map(|v| match v {
            Value::Array(items) => items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>(),
            Value::String(s) => s
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
                .collect(),
            _ => Vec::new(),
        })
        .unwrap_or_default();
    if user_ids.is_empty() {
        return Err(AppError::BadRequest("????ID".into()));
    }

    let placeholders = vec!["?"; user_ids.len()].join(", ");
    let sql = format!(
        "SELECT user_id, username FROM sys_user WHERE user_id IN ({placeholders}) AND tenant_id = ? AND deleted = 0"
    );
    let mut query = sqlx::query(&sql);
    for id in &user_ids {
        query = query.bind(id.clone());
    }
    query = query.bind(&user.tenant_id);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    let visible_ids = rows
        .iter()
        .map(|r| r.get::<String, _>("user_id"))
        .collect::<Vec<_>>();

    let mut kicked = 0usize;
    for user_id in visible_ids {
        if SessionCenter::revoke_all(&state, &user.tenant_id, &user_id)
            .await
            .is_ok()
        {
            kicked += 1;
        }
    }

    Ok(ApiResponse::success(serde_json::json!({
        "kicked": kicked,
        "message": format!("???? {kicked} ???"),
    })))
}
