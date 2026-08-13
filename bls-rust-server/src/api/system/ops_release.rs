use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use hmac::{Hmac, Mac};
use redis::AsyncCommands;
use serde_json::{Map, Value};
use sha2::Sha256;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::{row_to_json, rows_to_json};
use crate::error::AppError;
use crate::state::AppState;

type HmacSha256 = Hmac<Sha256>;

const SERVICES: &[&str] = &[
    "bls-admin",
    "bls-server",
    "bls-ai-service",
    "bls-event-service",
    "bls-java-server",
    "mysql",
    "redis",
    "minio",
];

const RELEASE_STEPS: &[(&str, &str)] = &[
    ("validate", "????"),
    ("lock", "?????"),
    ("backup", "????"),
    ("pull_images", "????"),
    ("update_services", "????"),
    ("wait_services", "??????"),
    ("health_check", "????"),
    ("business_check", "????"),
    ("complete", "????"),
];

const ROLLBACK_STEPS: &[(&str, &str)] = &[
    ("rollback", "????"),
    ("wait_services", "??????"),
    ("health_check", "????"),
    ("complete", "????"),
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/releases/callback", post(callback))
        .route("/releases/build-callback", post(build_callback))
        .route("/releases/versions", get(versions))
        .route("/releases/current", get(current))
        .route("/releases/running", get(running))
        .route("/releases/services/status", get(services_status))
        .route("/releases", get(list).post(create_release))
        .route("/releases/{taskId}", get(detail))
        .route("/releases/{taskId}/steps", get(steps))
        .route("/releases/{taskId}/logs", get(logs))
        .route("/releases/{taskId}/rollback", post(rollback))
}

fn ensure_perm(user: &AuthUser, perm: &str) -> Result<(), AppError> {
    crate::middleware::permission::ensure_perm(user, perm)
}

fn raw_body(body: String) -> Value {
    serde_json::from_str(&body).unwrap_or(Value::Object(Map::new()))
}

fn callback_secret() -> String {
    std::env::var("RELEASE_CALLBACK_SECRET").unwrap_or_default()
}

fn verify_callback(headers: &HeaderMap, body: &str) -> Result<(), AppError> {
    let secret = callback_secret();
    if secret.is_empty() {
        return Err(AppError::Forbidden("RELEASE_CALLBACK_SECRET ???".into()));
    }
    let timestamp = headers
        .get("x-release-timestamp")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let nonce = headers
        .get("x-release-nonce")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let signature = headers
        .get("x-release-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if timestamp.is_empty() || nonce.is_empty() || signature.is_empty() {
        return Err(AppError::Forbidden("???????".into()));
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let request_ms = timestamp.parse::<i64>().unwrap_or(0);
    if request_ms == 0 || (now_ms - request_ms).abs() > 5 * 60 * 1000 {
        return Err(AppError::Forbidden("???????????".into()));
    }

    let payload = format!("{timestamp}\n{nonce}\n{body}");
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts key");
    mac.update(payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    if signature != expected {
        return Err(AppError::Forbidden("????????".into()));
    }
    Ok(())
}

async fn check_and_save_nonce(state: &AppState, nonce: &str) -> Result<(), AppError> {
    let Some(client) = &state.redis else {
        return Ok(());
    };
    let mut conn = client.get_multiplexed_tokio_connection().await?;
    let key = format!("{}ops:release:nonce:{nonce}", state.config.redis.key_prefix);
    let exists: Option<String> = conn.get(&key).await?;
    if exists.is_some() {
        return Err(AppError::Conflict("Nonce ???".into()));
    }
    let _: () = conn.set_ex(&key, "1", 360).await?;
    Ok(())
}

async fn callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<ApiResponse<Value>, AppError> {
    verify_callback(&headers, &body)?;
    let value = raw_body(body);
    let task_id = value.get("taskId").and_then(Value::as_str).unwrap_or("");
    let stage = value.get("stage").and_then(Value::as_str).unwrap_or("");
    let status = value.get("status").and_then(Value::as_str).unwrap_or("");
    let progress = value
        .get("progress")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .clamp(0, 100);
    let message = value.get("message").and_then(Value::as_str).unwrap_or("");
    if task_id.is_empty() || stage.is_empty() || status.is_empty() {
        return Err(AppError::BadRequest("?? taskId/stage/status".into()));
    }

    check_and_save_nonce(
        &state,
        headers
            .get("x-release-nonce")
            .and_then(|v| v.to_str().ok())
            .unwrap_or(""),
    )
    .await?;

    let task = fetch_task_internal(&state, task_id).await?;
    if task.is_none() {
        return Err(AppError::NotFound("?????".into()));
    }
    let task = task.unwrap();
    let current_status = task
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if !matches!(
        current_status.as_str(),
        "running" | "checking" | "rolling_back"
    ) {
        return Err(AppError::BadRequest(format!("???? {current_status} ?????")));
    }

    let terminal = matches!(status, "failed" | "success" | "skipped" | "cancelled");
    if terminal {
        sqlx::query(
            "UPDATE ops_release_step SET status=?, progress=?, message=?, started_at=IFNULL(started_at,NOW()), finished_at=NOW(), update_time=NOW() WHERE task_id=? AND step_key=?",
        )
        .bind(status)
        .bind(progress)
        .bind(message)
        .bind(task_id)
        .bind(stage)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    } else {
        sqlx::query(
            "UPDATE ops_release_step SET status=?, progress=?, message=?, started_at=IFNULL(started_at,NOW()), update_time=NOW() WHERE task_id=? AND step_key=?",
        )
        .bind(status)
        .bind(progress)
        .bind(message)
        .bind(task_id)
        .bind(stage)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }

    sqlx::query(
        "UPDATE ops_release_task SET current_stage=?, progress=?, update_time=NOW() WHERE task_id=?",
    )
    .bind(stage)
    .bind(progress)
    .bind(task_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    append_release_log(
        &state,
        task_id,
        Some(stage),
        if status == "failed" { "error" } else { "info" },
        message,
    )
    .await;

    let lock_token = task
        .get("lockToken")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let source_task_id = task
        .get("sourceTaskId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let environment = task
        .get("environment")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let action = task
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("deploy")
        .to_string();
    let target_version = task
        .get("targetVersion")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if status == "failed" {
        sqlx::query(
            "UPDATE ops_release_task SET status='failed', error_message=?, current_stage=?, progress=?, finished_at=NOW(), update_time=NOW() WHERE task_id=?",
        )
        .bind(message)
        .bind(stage)
        .bind(progress)
        .bind(task_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
        release_environment_lock(&state, &environment, &lock_token).await;
        if !source_task_id.is_empty() {
            sqlx::query(
                "UPDATE ops_release_task SET status='failed', error_message=?, finished_at=NOW(), update_time=NOW() WHERE task_id=? AND status='rolling_back'",
            )
            .bind(format!("????: {message}"))
            .bind(&source_task_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
        }
    }

    if stage == "complete" && status == "success" {
        let final_status = if action == "rollback" {
            "rolled_back"
        } else {
            "success"
        };
        sqlx::query(
            "UPDATE ops_release_task SET status=?, progress=100, finished_at=NOW(), update_time=NOW() WHERE task_id=?",
        )
        .bind(final_status)
        .bind(task_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
        release_environment_lock(&state, &environment, &lock_token).await;
        if !source_task_id.is_empty() {
            sqlx::query(
                "UPDATE ops_release_task SET status='rolled_back', rollback_version=?, finished_at=NOW(), update_time=NOW() WHERE task_id=? AND status='rolling_back'",
            )
            .bind(target_version)
            .bind(&source_task_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
        }
    }

    Ok(ApiResponse::success(
        serde_json::json!({ "taskId": task_id }),
    ))
}

async fn build_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<ApiResponse<Value>, AppError> {
    verify_callback(&headers, &body)?;
    check_and_save_nonce(
        &state,
        headers
            .get("x-release-nonce")
            .and_then(|v| v.to_str().ok())
            .unwrap_or(""),
    )
    .await?;
    let value = raw_body(body);
    let version = value.get("version").and_then(Value::as_str).unwrap_or("");
    let status = value.get("status").and_then(Value::as_str).unwrap_or("");
    if version.is_empty() || status.is_empty() {
        return Err(AppError::BadRequest("?? version/status".into()));
    }
    let commit_hash = value.get("commitHash").and_then(Value::as_str);
    let services = value
        .get("services")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "".to_string());
    upsert_version(&state, version, status, commit_hash, Some(&services)).await?;
    Ok(ApiResponse::success(
        serde_json::json!({ "version": version, "status": status }),
    ))
}

async fn versions(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:view")?;
    let rows = sqlx::query(
        "SELECT * FROM ops_release_version WHERE status='built' AND deleted=0 ORDER BY create_time DESC LIMIT 20",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let values = rows_to_json(rows);
    let items = values
        .into_iter()
        .map(|v| {
            serde_json::json!({
                "version": v.get("version").cloned().unwrap_or(Value::Null),
                "commitHash": v.get("commitHash").cloned().unwrap_or(Value::Null),
                "builtAt": v.get("builtAt").cloned().unwrap_or(Value::Null),
                "available": true,
            })
        })
        .collect::<Vec<_>>();
    Ok(ApiResponse::success(Value::Array(items)))
}

async fn current(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HashMap<String, String>>,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:view")?;
    let environment = q
        .get("environment")
        .cloned()
        .unwrap_or_else(|| "production".to_string());
    let last = last_successful_version(&state, &user.tenant_id, &environment).await?;
    let version = last
        .as_ref()
        .and_then(|v| v.get("targetVersion").and_then(Value::as_str))
        .unwrap_or("");
    let deployed_at = last
        .as_ref()
        .and_then(|v| v.get("finishedAt").and_then(Value::as_str))
        .unwrap_or("");
    let deployed_by = last
        .as_ref()
        .and_then(|v| v.get("triggeredByName").and_then(Value::as_str))
        .unwrap_or("");
    let previous_version = last
        .as_ref()
        .and_then(|v| v.get("fromVersion").and_then(Value::as_str))
        .unwrap_or("");
    Ok(ApiResponse::success(serde_json::json!({
        "environment": environment,
        "version": version,
        "deployedAt": deployed_at,
        "deployedBy": deployed_by,
        "previousVersion": previous_version,
        "status": "healthy",
    })))
}

async fn running(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HashMap<String, String>>,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:view")?;
    let environment = q
        .get("environment")
        .cloned()
        .unwrap_or_else(|| "production".to_string());
    let task = find_running_task(&state, &user.tenant_id, &environment).await?;
    Ok(ApiResponse::success(task.unwrap_or(Value::Null)))
}

async fn services_status(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HashMap<String, String>>,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:service:view")?;
    let environment = q
        .get("environment")
        .cloned()
        .unwrap_or_else(|| "production".to_string());
    let last = last_successful_version(&state, &user.tenant_id, &environment).await?;
    let running = find_running_task(&state, &user.tenant_id, &environment).await?;
    let version = last
        .as_ref()
        .and_then(|v| v.get("targetVersion").and_then(Value::as_str))
        .unwrap_or("");

    let mut services = Vec::new();
    for name in SERVICES {
        let start = std::time::Instant::now();
        let (enabled, status, message) = check_service(&state, name).await;
        services.push(serde_json::json!({
            "name": name,
            "enabled": enabled,
            "status": status,
            "version": version,
            "responseTime": start.elapsed().as_millis(),
            "message": message,
        }));
    }

    let running_task = running
        .as_ref()
        .map(|v| {
            serde_json::json!({
                "taskId": v.get("taskId").cloned().unwrap_or(Value::Null),
                "status": v.get("status").cloned().unwrap_or(Value::Null),
                "progress": v.get("progress").cloned().unwrap_or(Value::Null),
            })
        })
        .unwrap_or(Value::Null);

    Ok(ApiResponse::success(serde_json::json!({
        "environment": environment,
        "currentVersion": version,
        "checkedAt": chrono::Utc::now().to_rfc3339(),
        "runningTask": running_task,
        "services": services,
    })))
}

async fn check_service(state: &AppState, name: &str) -> (bool, &'static str, String) {
    match name {
        "bls-admin" => check_http(&state.http, "http://bls-admin:80").await,
        "bls-server" => check_http(&state.http, "http://bls-server:7001/api/health").await,
        "bls-ai-service" => check_http(&state.http, "http://bls-ai-service:7201/health").await,
        "bls-event-service" => {
            check_http(&state.http, "http://bls-event-service:7101/health").await
        }
        "bls-java-server" => {
            check_http(&state.http, "http://bls-java-server:8080/api/health").await
        }
        "mysql" => {
            let ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();
            (
                true,
                if ok { "healthy" } else { "unhealthy" },
                if ok {
                    "????".to_string()
                } else {
                    "???????".to_string()
                },
            )
        }
        "redis" => {
            let mut ok = false;
            if let Some(client) = &state.redis {
                if let Ok(mut conn) = client.get_multiplexed_tokio_connection().await {
                    ok = redis::cmd("PING")
                        .query_async::<String>(&mut conn)
                        .await
                        .is_ok();
                }
            }
            (
                true,
                if ok { "healthy" } else { "unhealthy" },
                if ok {
                    "PONG".to_string()
                } else {
                    "Redis ???".to_string()
                },
            )
        }
        "minio" => check_http(&state.http, "http://minio:9000/minio/health/live").await,
        _ => (false, "unknown", "????".to_string()),
    }
}

async fn check_http(client: &reqwest::Client, url: &str) -> (bool, &'static str, String) {
    match client
        .get(url)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => (true, "healthy", "OK".to_string()),
        Ok(resp) => (
            true,
            "unhealthy",
            format!("HTTP {}", resp.status().as_u16()),
        ),
        Err(err) => (true, "unhealthy", format!("????: {err}")),
    }
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HashMap<String, String>>,
) -> Result<PageResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:view")?;
    let page_num = q
        .get("pageNum")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(1)
        .max(1);
    let page_size = q
        .get("pageSize")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(10)
        .clamp(1, 50);
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ops_release_task WHERE tenant_id=? AND deleted=0")
            .bind(&user.tenant_id)
            .fetch_one(&state.db)
            .await
            .map_err(AppError::from)?;
    let rows = sqlx::query(
        "SELECT * FROM ops_release_task WHERE tenant_id=? AND deleted=0 ORDER BY create_time DESC LIMIT ? OFFSET ?",
    )
    .bind(&user.tenant_id)
    .bind(page_size)
    .bind((page_num - 1) * page_size)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(PageResponse::success(
        Value::Array(rows_to_json(rows)),
        count as u64,
    ))
}

async fn detail(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:view")?;
    let task = fetch_task(&state, &user.tenant_id, &task_id)
        .await?
        .ok_or_else(|| AppError::NotFound("?????".into()))?;
    Ok(ApiResponse::success(task))
}

async fn steps(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:view")?;
    fetch_task(&state, &user.tenant_id, &task_id)
        .await?
        .ok_or_else(|| AppError::NotFound("?????".into()))?;
    let rows =
        sqlx::query("SELECT * FROM ops_release_step WHERE task_id=? ORDER BY step_order ASC")
            .bind(task_id)
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn logs(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    user: AuthUser,
    Query(q): Query<HashMap<String, String>>,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:logs")?;
    fetch_task(&state, &user.tenant_id, &task_id)
        .await?
        .ok_or_else(|| AppError::NotFound("?????".into()))?;
    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(100)
        .clamp(1, 500);
    let rows = sqlx::query(
        "SELECT * FROM ops_release_log WHERE task_id=? ORDER BY created_at ASC LIMIT ?",
    )
    .bind(task_id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn create_release(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:create")?;
    let environment = body
        .get("environment")
        .and_then(Value::as_str)
        .unwrap_or("");
    let version = body.get("version").and_then(Value::as_str).unwrap_or("");
    let services = body
        .get("services")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let reason = body.get("reason").and_then(Value::as_str).unwrap_or("");

    if !matches!(environment, "production" | "staging") {
        return Err(AppError::BadRequest(
            "environment ??? production/staging".into(),
        ));
    }
    if !is_semver(version) {
        return Err(AppError::BadRequest("version ?????????? (x.y.z)".into()));
    }
    if services.is_empty()
        || services.iter().any(|s| {
            ![
                "bls-admin",
                "bls-server",
                "bls-ai-service",
                "bls-event-service",
                "bls-java-server",
            ]
            .contains(&s.as_str())
        })
    {
        return Err(AppError::BadRequest("services ?????".into()));
    }
    if reason.is_empty() || reason.chars().count() > 500 {
        return Err(AppError::BadRequest("reason ????????? 500 ??".into()));
    }

    let built_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ops_release_version WHERE version=? AND status='built' AND deleted=0",
    )
    .bind(version)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if built_count == 0 {
        return Err(AppError::BadRequest(format!("?? {version} ??????")));
    }

    if find_running_task(&state, &user.tenant_id, environment)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict(format!("{environment} ???????????")));
    }

    let lock_key = format!(
        "{}ops:release:lock:{environment}",
        state.config.redis.key_prefix
    );
    let lock_token = acquire_environment_lock(&state, &lock_key, environment).await?;
    let last = last_successful_version(&state, &user.tenant_id, environment).await?;
    let from_version = last
        .as_ref()
        .and_then(|v| v.get("targetVersion").and_then(Value::as_str))
        .map(ToOwned::to_owned);
    let task_id = state.snowflake.next_id()?;
    let services_str = services.join(" ");

    sqlx::query(
        "INSERT INTO ops_release_task (task_id, tenant_id, environment, action, from_version, target_version, services, status, current_stage, progress, reason, github_run_id, triggered_by, triggered_by_name, lock_token, deleted, create_time, update_time)
         VALUES (?, ?, ?, 'deploy', ?, ?, ?, 'running', NULL, 0, ?, NULL, ?, ?, ?, 0, NOW(), NOW())",
    )
    .bind(&task_id)
    .bind(&user.tenant_id)
    .bind(environment)
    .bind(from_version)
    .bind(version)
    .bind(services_str)
    .bind(reason)
    .bind(&user.user_id)
    .bind(&user.username)
    .bind(lock_token)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    create_steps(&state, &task_id, RELEASE_STEPS).await?;
    append_release_log(
        &state,
        &task_id,
        None,
        "info",
        &format!("??????: {environment} ? {version}"),
    )
    .await;
    let task = fetch_task(&state, &user.tenant_id, &task_id)
        .await?
        .ok_or_else(|| AppError::NotFound("?????".into()))?;
    Ok(ApiResponse::success_with_message(task, "???????"))
}

async fn rollback(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    ensure_perm(&user, "ops:release:rollback")?;
    let task = fetch_task(&state, &user.tenant_id, &task_id)
        .await?
        .ok_or_else(|| AppError::NotFound("?????".into()))?;
    let task_status = task.get("status").and_then(Value::as_str).unwrap_or("");
    if task_status != "failed" {
        return Err(AppError::BadRequest(format!(
            "????????????????: {task_status}"
        )));
    }
    let target_version = task
        .get("fromVersion")
        .and_then(Value::as_str)
        .or_else(|| task.get("rollbackVersion").and_then(Value::as_str))
        .unwrap_or("");
    if target_version.is_empty() {
        return Err(AppError::BadRequest("???????".into()));
    }
    let environment = task
        .get("environment")
        .and_then(Value::as_str)
        .unwrap_or("");
    let services = task.get("services").and_then(Value::as_str).unwrap_or("");
    let lock_key = format!(
        "{}ops:release:lock:{environment}",
        state.config.redis.key_prefix
    );
    let lock_token = acquire_environment_lock(&state, &lock_key, environment).await?;
    let rollback_task_id = state.snowflake.next_id()?;

    sqlx::query(
        "INSERT INTO ops_release_task (task_id, tenant_id, environment, action, from_version, target_version, services, status, current_stage, progress, reason, github_run_id, triggered_by, triggered_by_name, source_task_id, lock_token, deleted, create_time, update_time)
         VALUES (?, ?, ?, 'rollback', ?, ?, ?, 'running', NULL, 0, ?, NULL, ?, ?, ?, ?, 0, NOW(), NOW())",
    )
    .bind(&rollback_task_id)
    .bind(&user.tenant_id)
    .bind(environment)
    .bind(task.get("targetVersion").and_then(Value::as_str).unwrap_or(""))
    .bind(target_version)
    .bind(services)
    .bind(format!("?????? {task_id}"))
    .bind(&user.user_id)
    .bind(&user.username)
    .bind(&task_id)
    .bind(lock_token)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    sqlx::query(
        "UPDATE ops_release_task SET status='rolling_back', update_time=NOW() WHERE task_id=?",
    )
    .bind(&task_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    create_steps(&state, &rollback_task_id, ROLLBACK_STEPS).await?;
    append_release_log(
        &state,
        &rollback_task_id,
        None,
        "warn",
        &format!("?????? ? {target_version}"),
    )
    .await;

    Ok(ApiResponse::success(serde_json::json!({
        "taskId": rollback_task_id,
        "targetVersion": target_version,
    })))
}

async fn fetch_task(
    state: &AppState,
    tenant_id: &str,
    task_id: &str,
) -> Result<Option<Value>, AppError> {
    let row =
        sqlx::query("SELECT * FROM ops_release_task WHERE task_id=? AND tenant_id=? AND deleted=0")
            .bind(task_id)
            .bind(tenant_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(row.map(|r| row_to_json(&r)))
}

async fn fetch_task_internal(state: &AppState, task_id: &str) -> Result<Option<Value>, AppError> {
    let row = sqlx::query("SELECT * FROM ops_release_task WHERE task_id=? AND deleted=0")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(row.map(|r| row_to_json(&r)))
}

async fn find_running_task(
    state: &AppState,
    tenant_id: &str,
    environment: &str,
) -> Result<Option<Value>, AppError> {
    let row = sqlx::query(
        "SELECT * FROM ops_release_task WHERE environment=? AND tenant_id=? AND deleted=0 AND status IN ('pending','checking','waiting_approval','running','rolling_back') ORDER BY create_time DESC LIMIT 1",
    )
    .bind(environment)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(row.map(|r| row_to_json(&r)))
}

async fn last_successful_version(
    state: &AppState,
    tenant_id: &str,
    environment: &str,
) -> Result<Option<Value>, AppError> {
    let row = sqlx::query(
        "SELECT * FROM ops_release_task WHERE environment=? AND tenant_id=? AND deleted=0 AND status='success' AND action='deploy' ORDER BY create_time DESC LIMIT 1",
    )
    .bind(environment)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(row.map(|r| row_to_json(&r)))
}

async fn create_steps(
    state: &AppState,
    task_id: &str,
    steps: &[(&str, &str)],
) -> Result<(), AppError> {
    for (order, (key, name)) in steps.iter().enumerate() {
        let step_id = state.snowflake.next_id()?;
        sqlx::query(
            "INSERT INTO ops_release_step (step_id, task_id, step_key, step_name, step_order, status, progress, message, create_time, update_time)
             VALUES (?, ?, ?, ?, ?, 'waiting', 0, NULL, NOW(), NOW())",
        )
        .bind(step_id)
        .bind(task_id)
        .bind(*key)
        .bind(*name)
        .bind((order + 1) as i32)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }
    Ok(())
}

async fn append_release_log(
    state: &AppState,
    task_id: &str,
    step_key: Option<&str>,
    level: &str,
    message: &str,
) {
    let Ok(log_id) = state.snowflake.next_id() else {
        return;
    };
    let safe_message = if message.chars().count() > 5000 {
        format!(
            "{}...[truncated]",
            &message[..message.floor_char_boundary(5000)]
        )
    } else {
        message.to_string()
    };
    let _ = sqlx::query(
        "INSERT INTO ops_release_log (log_id, task_id, step_key, level, message, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
    )
    .bind(log_id)
    .bind(task_id)
    .bind(step_key)
    .bind(level)
    .bind(safe_message)
    .execute(&state.db)
    .await;
}

async fn acquire_environment_lock(
    state: &AppState,
    lock_key: &str,
    environment: &str,
) -> Result<String, AppError> {
    let Some(client) = &state.redis else {
        if environment == "production" {
            return Err(AppError::Conflict("Redis ????????????".into()));
        }
        return Ok("no-redis".to_string());
    };
    let token = state.snowflake.next_id()?;
    let mut conn = client.get_multiplexed_tokio_connection().await?;
    let result: Option<String> = redis::cmd("SET")
        .arg(lock_key)
        .arg(&token)
        .arg("PX")
        .arg(600_000)
        .arg("NX")
        .query_async(&mut conn)
        .await?;
    if result.as_deref() == Some("OK") {
        Ok(token)
    } else {
        Err(AppError::Conflict(format!("{environment} ???????????")))
    }
}

async fn release_environment_lock(state: &AppState, environment: &str, token: &str) {
    if token.is_empty() || token == "no-redis" {
        return;
    }
    let Some(client) = &state.redis else {
        return;
    };
    let Ok(mut conn) = client.get_multiplexed_tokio_connection().await else {
        return;
    };
    let key = format!(
        "{}ops:release:lock:{environment}",
        state.config.redis.key_prefix
    );
    let current: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await
        .unwrap_or(None);
    if current.as_deref() == Some(token) {
        let _: redis::RedisResult<()> = conn.del(&key).await;
    }
}

async fn upsert_version(
    state: &AppState,
    version: &str,
    status: &str,
    commit_hash: Option<&str>,
    services: Option<&str>,
) -> Result<(), AppError> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT version_id FROM ops_release_version WHERE version=? LIMIT 1")
            .bind(version)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    if let Some(version_id) = existing {
        sqlx::query(
            "UPDATE ops_release_version SET status=?, commit_hash=?, services=?, built_at=IF(?='built', NOW(), built_at), update_time=NOW() WHERE version_id=?",
        )
        .bind(status)
        .bind(commit_hash)
        .bind(services)
        .bind(status)
        .bind(version_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    } else {
        let version_id = state.snowflake.next_id()?;
        sqlx::query(
            "INSERT INTO ops_release_version (version_id, version, commit_hash, status, services, built_at, tenant_id, deleted, create_time, update_time)
             VALUES (?, ?, ?, ?, ?, IF(?='built', NOW(), NULL), '000000', 0, NOW(), NOW())",
        )
        .bind(version_id)
        .bind(version)
        .bind(commit_hash)
        .bind(status)
        .bind(services)
        .bind(status)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }
    Ok(())
}

fn is_semver(version: &str) -> bool {
    let parts = version.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.chars().all(|c| c.is_ascii_digit())
                && !(p.len() > 1 && p.starts_with('0'))
        })
}
