use axum::extract::{Multipart, Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::{Value, json};
use std::collections::HashMap;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::row_to_json;
use crate::error::AppError;
use crate::services::storage_provider::{self, StorageConfig};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list))
        .route("/add", post(add))
        .route("/edit", put(edit))
        .route("/remove", delete(remove))
        .route("/upload", post(upload))
        .route("/files", get(files))
        .route("/file/{fileId}", delete(remove_file))
        .route("/file/{fileId}/url", get(file_url))
        .route("/file/{fileId}/download", get(download))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:storage:list")?;
    let rows = sqlx::query(
        "SELECT * FROM sys_storage_config WHERE tenant_id = ? AND deleted = 0 ORDER BY create_time DESC",
    )
    .bind(&user.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(
        crate::db::query::rows_to_json(rows),
    )))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:storage:add")?;
    let storage_id = state.snowflake.next_id()?;
    sqlx::query(
        "INSERT INTO sys_storage_config (storage_id, tenant_id, storage_name, storage_type, endpoint, region, access_key, secret_key, port, use_ssl, public_bucket, private_bucket, public_base_url, private_base_url, path_style, config_json, policy_json, is_default, status, remark, create_by, create_time, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', ?, ?, NOW(), 0)",
    )
    .bind(&storage_id)
    .bind(&user.tenant_id)
    .bind(body.get("storageName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("storageType").and_then(Value::as_str).unwrap_or("local"))
    .bind(body.get("endpoint").and_then(Value::as_str))
    .bind(body.get("region").and_then(Value::as_str))
    .bind(body.get("accessKey").and_then(Value::as_str))
    .bind(body.get("secretKey").and_then(Value::as_str))
    .bind(body.get("port").and_then(Value::as_i64))
    .bind(body.get("useSsl").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("publicBucket").and_then(Value::as_str))
    .bind(body.get("privateBucket").and_then(Value::as_str))
    .bind(body.get("publicBaseUrl").and_then(Value::as_str))
    .bind(body.get("privateBaseUrl").and_then(Value::as_str))
    .bind(body.get("pathStyle").and_then(Value::as_i64).unwrap_or(1))
    .bind(body.get("configJson").cloned().map(|v| v.to_string()))
    .bind(body.get("policyJson").cloned().map(|v| v.to_string()))
    .bind(body.get("isDefault").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("remark").and_then(Value::as_str))
    .bind(&user.user_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("????"))
}

async fn edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:storage:edit")?;
    let storage_id = body.get("storageId").and_then(Value::as_str).unwrap_or("");
    sqlx::query(
        "UPDATE sys_storage_config SET storage_name=?, storage_type=?, endpoint=?, region=?, access_key=?, secret_key=?, port=?, use_ssl=?, public_bucket=?, private_bucket=?, public_base_url=?, private_base_url=?, path_style=?, status=?, remark=? WHERE storage_id=? AND tenant_id=?",
    )
    .bind(body.get("storageName").and_then(Value::as_str).unwrap_or(""))
    .bind(body.get("storageType").and_then(Value::as_str).unwrap_or("local"))
    .bind(body.get("endpoint").and_then(Value::as_str))
    .bind(body.get("region").and_then(Value::as_str))
    .bind(body.get("accessKey").and_then(Value::as_str))
    .bind(body.get("secretKey").and_then(Value::as_str))
    .bind(body.get("port").and_then(Value::as_i64))
    .bind(body.get("useSsl").and_then(Value::as_i64).unwrap_or(0))
    .bind(body.get("publicBucket").and_then(Value::as_str))
    .bind(body.get("privateBucket").and_then(Value::as_str))
    .bind(body.get("publicBaseUrl").and_then(Value::as_str))
    .bind(body.get("privateBaseUrl").and_then(Value::as_str))
    .bind(body.get("pathStyle").and_then(Value::as_i64).unwrap_or(1))
    .bind(body.get("status").and_then(Value::as_str).unwrap_or("0"))
    .bind(body.get("remark").and_then(Value::as_str))
    .bind(storage_id)
    .bind(&user.tenant_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("????"))
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:storage:remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "UPDATE sys_storage_config SET deleted=1 WHERE storage_id IN ({placeholders}) AND tenant_id=?"
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query = query.bind(&user.tenant_id);
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("????"))
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

async fn upload(
    State(state): State<AppState>,
    user: AuthUser,
    mut multipart: Multipart,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:file:upload")?;
    let mut original_name = String::new();
    let mut mime_type = None;
    let mut file_data: Option<Vec<u8>> = None;
    let mut access_type = "private".to_string();
    let mut module_name = None;
    let mut storage_id = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        match field.name() {
            Some("file") => {
                original_name = sanitize_filename(field.file_name().unwrap_or("upload.bin"));
                mime_type = field.content_type().map(ToOwned::to_owned);
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                file_data = Some(data.to_vec());
            }
            Some("accessType") => {
                access_type = field.text().await.unwrap_or_else(|_| "private".into());
            }
            Some("moduleName") => {
                module_name = Some(field.text().await.unwrap_or_else(|_| "files".into()));
            }
            Some("storageId") => {
                storage_id = Some(field.text().await.unwrap_or_else(|_| String::new()));
            }
            _ => {}
        }
    }

    let data = file_data.ok_or_else(|| AppError::BadRequest("missing file".into()))?;
    let config = load_storage_config(&state, &user.tenant_id, storage_id.as_deref()).await?;
    let max_size = load_upload_limit_mb(&state, &user.tenant_id).await? as usize * 1024 * 1024;
    if max_size > 0 && data.len() > max_size {
        return Err(AppError::BadRequest(format!(
            "file size exceeds {}MB",
            max_size / 1024 / 1024
        )));
    }
    crate::security::file_security::validate_extension(&original_name, "*")?;

    let safe_name = format!("{}_{}", state.snowflake.next_id()?, original_name);
    let uploaded = storage_provider::upload(
        &config,
        &user.tenant_id,
        &access_type,
        module_name.as_deref(),
        &original_name,
        &safe_name,
        mime_type.as_deref(),
        &data,
        &state.config.upload_dir,
    )
    .await?;

    let file_id = state.snowflake.next_id()?;
    let ext = file_extension(&original_name);
    let bucket_name = uploaded.bucket_name.clone();
    let object_name = uploaded.object_name.clone();
    let uploaded_url = uploaded.url.clone();
    sqlx::query(
        "INSERT INTO sys_file (file_id, tenant_id, storage_id, bucket_name, object_name, original_name, file_name, file_ext, mime_type, file_size, access_type, module_name, url, create_by, create_time, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)",
    )
    .bind(&file_id)
    .bind(&user.tenant_id)
    .bind(&config.storage_id)
    .bind(bucket_name.clone())
    .bind(object_name.clone())
    .bind(original_name.clone())
    .bind(safe_name.clone())
    .bind(ext)
    .bind(mime_type)
    .bind(data.len() as i64)
    .bind(access_type)
    .bind(module_name)
    .bind(uploaded_url.clone())
    .bind(&user.user_id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(ApiResponse::success(json!(
        {
            "fileId": file_id,
            "url": uploaded_url,
            "bucketName": bucket_name,
            "objectName": object_name,
            "originalName": original_name.clone(),
            "fileName": safe_name.clone(),
            "fileSize": data.len(),
        }
    )))
}

async fn load_storage_config(
    state: &AppState,
    tenant_id: &str,
    requested_id: Option<&str>,
) -> Result<StorageConfig, AppError> {
    let row = if let Some(id) = requested_id.filter(|s| !s.is_empty()) {
        sqlx::query(
            "SELECT * FROM sys_storage_config WHERE storage_id = ? AND (tenant_id = ? OR tenant_id = '000000') AND deleted = 0",
        )
        .bind(id)
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?
    } else {
        sqlx::query(
            "SELECT * FROM sys_storage_config WHERE tenant_id = ? AND deleted = 0 AND status = '0' ORDER BY is_default DESC, create_time ASC LIMIT 1",
        )
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?
    };

    row.and_then(|r| StorageConfig::from_row(row_to_json(&r)))
        .ok_or_else(|| AppError::NotFound("storage config not found".into()))
}

async fn load_upload_limit_mb(state: &AppState, tenant_id: &str) -> Result<u64, AppError> {
    let value = sqlx::query_scalar::<_, String>(
        "SELECT config_value FROM sys_config WHERE config_key = 'sys.upload.maxSize' AND tenant_id = ? AND status = '0' ORDER BY create_time DESC LIMIT 1",
    )
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(value
        .as_deref()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|v| (1..=500).contains(v))
        .unwrap_or(20))
}

fn file_extension(filename: &str) -> Option<String> {
    std::path::Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .map(ToOwned::to_owned)
}

fn sanitize_filename(filename: &str) -> String {
    filename
        .replace('\\', "_")
        .replace('/', "_")
        .chars()
        .filter(|c| !c.is_control())
        .collect()
}

async fn files(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    user: AuthUser,
) -> Result<PageResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:file:list")?;
    let mut filter_sql = String::from(" WHERE tenant_id = ? AND deleted = 0");
    let mut binds: Vec<String> = vec![user.tenant_id.clone()];
    if let Some(v) = q.get("originalName").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND original_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.get("moduleName").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND module_name LIKE ?");
        binds.push(format!("%{v}%"));
    }
    if let Some(v) = q.get("accessType").filter(|s| !s.is_empty()) {
        filter_sql.push_str(" AND access_type = ?");
        binds.push(v.clone());
    }
    let count_sql = format!("SELECT COUNT(*) FROM sys_file{filter_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds { count_query = count_query.bind(b.clone()); }
    let total: i64 = count_query.fetch_one(&state.db).await.unwrap_or(0);
    let page_num = q.get("pageNum").and_then(|s| s.parse::<u64>().ok()).unwrap_or(1).max(1);
    let page_size = q.get("pageSize").and_then(|s| s.parse::<u64>().ok()).unwrap_or(10).clamp(1, 100);
    let offset = (page_num - 1) * page_size;
    let sql = format!("SELECT * FROM sys_file{filter_sql} ORDER BY create_time DESC LIMIT ? OFFSET ?");
    let mut query = sqlx::query(&sql);
    for b in binds { query = query.bind(b); }
    query = query.bind(page_size as i64).bind(offset as i64);
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(PageResponse::success(
        Value::Array(crate::db::query::rows_to_json(rows)),
        total as u64,
    ))
}

async fn remove_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:file:remove")?;
    sqlx::query("UPDATE sys_file SET deleted=1 WHERE file_id=? AND tenant_id=?")
        .bind(id)
        .bind(&user.tenant_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("????"))
}

async fn file_url(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:file:download")?;
    let row = sqlx::query("SELECT * FROM sys_file WHERE file_id=? AND tenant_id=? AND deleted=0")
        .bind(id)
        .bind(&user.tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(
        row.map(|r| row_to_json(&r)).unwrap_or(json!({})),
    ))
}

async fn download(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:file:download")?;
    let row = sqlx::query("SELECT * FROM sys_file WHERE file_id=? AND tenant_id=? AND deleted=0")
        .bind(id)
        .bind(&user.tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::success(
        row.map(|r| row_to_json(&r)).unwrap_or(json!({})),
    ))
}
