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
    #[serde(default = "default_page_num")]
    page_num: u64,
    #[serde(default = "default_page_size")]
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
    let mut sql = "SELECT u.*, d.dept_name FROM sys_user u LEFT JOIN sys_dept d ON u.dept_id = d.dept_id AND u.tenant_id = d.tenant_id WHERE u.deleted = 0".to_string();
    let mut binds: Vec<String> = Vec::new();
    if user.tenant_id != "000000" {
        sql.push_str(" AND u.tenant_id = ?");
        binds.push(user.tenant_id.clone());
    }
    if let Some(kw) = q.keyword.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND (u.username LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ?)");
        for _ in 0..3 {
            binds.push(format!("%{kw}%"));
        }
    }
    if let Some(status) = q.status.as_deref() {
        sql.push_str(" AND u.status = ?");
        binds.push(status.to_string());
    }
    if let Some(dept_id) = q.dept_id.as_deref() {
        sql.push_str(" AND u.dept_id = ?");
        binds.push(dept_id.to_string());
    }
    sql.push_str(" ORDER BY u.create_time DESC LIMIT ? OFFSET ?");
    binds.push(q.page_size.min(100).to_string());
    binds.push(((q.page_num.max(1) - 1) * q.page_size.min(100)).to_string());

    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b.clone());
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    let data = rows_to_json(rows);
    Ok(PageResponse::success(Value::Array(data), 0))
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
    sqlx::query("UPDATE sys_user SET nickname = ?, email = ?, phone = ?, avatar = ? WHERE user_id = ? AND tenant_id = ?")
        .bind(nickname).bind(email).bind(phone).bind(avatar).bind(&user.user_id).bind(&user.tenant_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("更新成功"))
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
    let password = body
        .get("password")
        .and_then(Value::as_str)
        .unwrap_or("123456");
    let hashed = hash_argon2id(password)?;
    let dept_id = body.get("deptId").and_then(Value::as_str).unwrap_or("");
    let phone = body.get("phone").and_then(Value::as_str).unwrap_or("");
    let email = body.get("email").and_then(Value::as_str).unwrap_or("");
    sqlx::query(
        "INSERT INTO sys_user (user_id, tenant_id, username, nickname, password, password_algorithm, dept_id, phone, email, status, deleted, create_time)
         VALUES (?, ?, ?, ?, ?, 'argon2id', ?, ?, ?, '0', 0, NOW())",
    )
    .bind(id).bind(&user.tenant_id).bind(username).bind(nickname).bind(hashed)
    .bind(if dept_id.is_empty() { None } else { Some(dept_id) }).bind(phone).bind(email)
    .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("新增成功"))
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
        .ok_or_else(|| AppError::BadRequest("缺少 userId".into()))?;
    let nickname = body.get("nickname").and_then(Value::as_str).unwrap_or("");
    let phone = body.get("phone").and_then(Value::as_str).unwrap_or("");
    let email = body.get("email").and_then(Value::as_str).unwrap_or("");
    let status = body.get("status").and_then(Value::as_str).unwrap_or("0");
    sqlx::query("UPDATE sys_user SET nickname = ?, phone = ?, email = ?, status = ? WHERE user_id = ? AND tenant_id = ?")
        .bind(nickname).bind(phone).bind(email).bind(status).bind(user_id).bind(&user.tenant_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("编辑成功"))
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
