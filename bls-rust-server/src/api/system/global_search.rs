use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde_json::{Map, Value};

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::rows_to_json;
use crate::error::AppError;
use crate::state::AppState;
use crate::utils::case::to_camel_key;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/search", get(search))
        .route("/config/list", get(config_list))
        .route("/config/save", post(config_save))
        .route("/config/{id}", delete(config_delete))
        .route("/index/modules", get(index_modules))
        .route("/index/rebuild", post(index_rebuild))
}

async fn search(
    State(state): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:global-search:search")?;
    let keyword = q.get("keyword").cloned().unwrap_or_default();
    if keyword.chars().count() < 2 {
        return Ok(ApiResponse::success(Value::Array(vec![])));
    }
    let like = format!("%{keyword}%");
    let rows = sqlx::query(
        "SELECT * FROM sys_search_index WHERE tenant_id=? AND deleted=0 AND status='0' AND (title LIKE ? OR subtitle LIKE ? OR content LIKE ?) ORDER BY create_time DESC LIMIT 50",
    )
    .bind(&user.tenant_id)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let values = rows_to_json(rows);
    let mut groups: Vec<Value> = Vec::new();
    let mut group_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for value in values {
        let Some(row) = value.as_object() else {
            continue;
        };
        let module_key = row
            .get("moduleKey")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if module_key.is_empty() {
            continue;
        }

        let index = if let Some(index) = group_map.get(&module_key) {
            *index
        } else {
            let index = groups.len();
            group_map.insert(module_key.clone(), index);
            groups.push(serde_json::json!({
                "moduleKey": module_key,
                "moduleName": row.get("moduleName").cloned().unwrap_or(Value::Null),
                "routePath": row.get("routePath").cloned().unwrap_or(Value::Null),
                "list": [],
            }));
            index
        };

        let item = serde_json::json!({
            "id": row.get("bizId").cloned().unwrap_or(Value::Null),
            "title": row.get("title").cloned().unwrap_or(Value::Null),
            "subtitle": row.get("subtitle").cloned().unwrap_or(Value::Null),
            "moduleKey": module_key,
            "moduleName": row.get("moduleName").cloned().unwrap_or(Value::Null),
            "routePath": row.get("routePath").cloned().unwrap_or(Value::Null),
        });
        if let Some(group) = groups.get_mut(index).and_then(Value::as_object_mut) {
            if let Some(list) = group.get_mut("list").and_then(Value::as_array_mut) {
                list.push(item);
            }
        }
    }

    Ok(ApiResponse::success(Value::Array(groups)))
}

async fn config_list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:global-search:config:list")?;
    let rows =
        sqlx::query("SELECT * FROM sys_global_search_config WHERE deleted=0 ORDER BY sort ASC")
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn config_save(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:global-search:config:save")?;
    let search_id = body
        .get("searchId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let module_key = body.get("moduleKey").and_then(Value::as_str).unwrap_or("");
    let module_name = body.get("moduleName").and_then(Value::as_str).unwrap_or("");
    let permission = body.get("permission").and_then(Value::as_str).unwrap_or("");
    let route_path = body.get("routePath").and_then(Value::as_str);
    let source_table = body.get("sourceTable").and_then(Value::as_str);
    let biz_id_field = body.get("bizIdField").and_then(Value::as_str);
    let title_field = body.get("titleField").and_then(Value::as_str);
    let subtitle_field = body.get("subtitleField").and_then(Value::as_str);
    let content_fields = body.get("contentFields").and_then(Value::as_str);
    let tenant_field = body.get("tenantField").and_then(Value::as_str);
    let owner_field = body.get("ownerField").and_then(Value::as_str);
    let dept_field = body.get("deptField").and_then(Value::as_str);
    let created_by_field = body.get("createdByField").and_then(Value::as_str);
    let status_field = body.get("statusField").and_then(Value::as_str);
    let deleted_field = body.get("deletedField").and_then(Value::as_str);
    let enabled = body.get("enabled").and_then(Value::as_i64).unwrap_or(1);
    let sort = body.get("sort").and_then(Value::as_i64).unwrap_or(0);
    let remark = body.get("remark").and_then(Value::as_str);

    if search_id.is_empty() {
        let id = state.snowflake.next_id()?;
        sqlx::query(
            "INSERT INTO sys_global_search_config (search_id, module_key, module_name, permission, route_path, source_table, biz_id_field, title_field, subtitle_field, content_fields, tenant_field, owner_field, dept_field, created_by_field, status_field, deleted_field, enabled, sort, remark, deleted, create_time)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NOW())",
        )
        .bind(&id)
        .bind(module_key)
        .bind(module_name)
        .bind(permission)
        .bind(route_path)
        .bind(source_table)
        .bind(biz_id_field)
        .bind(title_field)
        .bind(subtitle_field)
        .bind(content_fields)
        .bind(tenant_field)
        .bind(owner_field)
        .bind(dept_field)
        .bind(created_by_field)
        .bind(status_field)
        .bind(deleted_field)
        .bind(enabled)
        .bind(sort)
        .bind(remark)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    } else {
        sqlx::query(
            "UPDATE sys_global_search_config SET module_key=?, module_name=?, permission=?, route_path=?, source_table=?, biz_id_field=?, title_field=?, subtitle_field=?, content_fields=?, tenant_field=?, owner_field=?, dept_field=?, created_by_field=?, status_field=?, deleted_field=?, enabled=?, sort=?, remark=?, update_time=NOW() WHERE search_id=?",
        )
        .bind(module_key)
        .bind(module_name)
        .bind(permission)
        .bind(route_path)
        .bind(source_table)
        .bind(biz_id_field)
        .bind(title_field)
        .bind(subtitle_field)
        .bind(content_fields)
        .bind(tenant_field)
        .bind(owner_field)
        .bind(dept_field)
        .bind(created_by_field)
        .bind(status_field)
        .bind(deleted_field)
        .bind(enabled)
        .bind(sort)
        .bind(remark)
        .bind(&search_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    }
    Ok(ApiResponse::message_only("saved"))
}

async fn config_delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:global-search:config:delete")?;
    sqlx::query("UPDATE sys_global_search_config SET deleted=1 WHERE search_id=?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(ApiResponse::message_only("deleted"))
}

async fn index_modules(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:search-index:rebuild")?;
    let rows = sqlx::query(
        "SELECT module_key, module_name FROM sys_global_search_config WHERE enabled=1 AND deleted=0 ORDER BY sort ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(ApiResponse::success(Value::Array(rows_to_json(rows))))
}

async fn index_rebuild(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<ApiResponse<Value>, AppError> {
    crate::middleware::permission::ensure_perm(&user, "system:search-index:rebuild")?;
    let module_keys = body
        .get("moduleKeys")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut sql =
        "SELECT * FROM sys_global_search_config WHERE enabled=1 AND deleted=0".to_string();
    if !module_keys.is_empty() {
        let placeholders = vec!["?"; module_keys.len()].join(", ");
        sql.push_str(&format!(" AND module_key IN ({placeholders})"));
    }
    sql.push_str(" ORDER BY sort ASC");

    let mut query = sqlx::query(&sql);
    for key in &module_keys {
        query = query.bind(key.clone());
    }
    let configs = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    let configs = rows_to_json(configs);

    if configs.is_empty() {
        return Err(AppError::BadRequest("??????????".into()));
    }

    let mut result = serde_json::json!({
        "totalTables": configs.len(),
        "successTables": 0,
        "failedTables": 0,
        "totalRows": 0,
        "details": [],
    });

    for cfg in &configs {
        let Some(cfg) = cfg.as_object() else {
            record_rebuild_result(&mut result, "", "", 0, Some("invalid config"));
            continue;
        };
        let module_key = cfg
            .get("moduleKey")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let module_name = cfg
            .get("moduleName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let source_table = cfg
            .get("sourceTable")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        if source_table.is_empty() {
            record_rebuild_result(&mut result, &module_key, &module_name, 0, Some("??????"));
            continue;
        }

        let rebuild_result =
            rebuild_one_module(&state, cfg, &module_key, &module_name, &source_table).await;
        match rebuild_result {
            Ok(count) => record_rebuild_result(&mut result, &module_key, &module_name, count, None),
            Err(err) => record_rebuild_result(
                &mut result,
                &module_key,
                &module_name,
                0,
                Some(&err.to_string()),
            ),
        }
    }

    let total_rows = result.get("totalRows").and_then(Value::as_i64).unwrap_or(0);
    Ok(ApiResponse::success_with_message(
        result,
        format!("?????{total_rows}???"),
    ))
}

fn record_rebuild_result(
    result: &mut Value,
    module_key: &str,
    module_name: &str,
    row_count: i64,
    error: Option<&str>,
) {
    if error.is_some() {
        increment_json_int(result, "failedTables", 1);
    } else {
        increment_json_int(result, "successTables", 1);
    }
    increment_json_int(result, "totalRows", row_count);
    if let Some(details) = result.get_mut("details").and_then(Value::as_array_mut) {
        details.push(serde_json::json!({
            "moduleKey": module_key,
            "moduleName": module_name,
            "rowCount": row_count,
            "error": error,
        }));
    }
}

fn increment_json_int(value: &mut Value, key: &str, delta: i64) {
    if let Some(slot) = value.get_mut(key) {
        if let Some(current) = slot.as_i64() {
            *slot = Value::from(current + delta);
        }
    }
}

async fn rebuild_one_module(
    state: &AppState,
    cfg: &Map<String, Value>,
    module_key: &str,
    module_name: &str,
    source_table: &str,
) -> Result<i64, AppError> {
    let safe_table = quote_ident(source_table);
    let mut source_sql = format!("SELECT * FROM {safe_table}");
    if let Some(deleted_field) = cfg
        .get("deletedField")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        source_sql.push_str(&format!(" WHERE {} = 0", quote_ident(deleted_field)));
    }

    let rows = sqlx::query(&source_sql)
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    let rows = rows_to_json(rows);

    sqlx::query("DELETE FROM sys_search_index WHERE module_key = ?")
        .bind(module_key)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;

    let mut count = 0i64;
    for row in rows {
        let Some(row) = row.as_object() else {
            continue;
        };
        let tenant_id = cfg
            .get("tenantField")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .and_then(|field| row.get(&to_camel_key(field)))
            .and_then(Value::as_str)
            .unwrap_or("000000");

        let biz_id = cfg
            .get("bizIdField")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .and_then(|field| row.get(&to_camel_key(field)))
            .map(value_to_string)
            .unwrap_or_default();
        let title = cfg
            .get("titleField")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .and_then(|field| row.get(&to_camel_key(field)))
            .map(value_to_string)
            .unwrap_or_default();
        let subtitle = cfg
            .get("subtitleField")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .and_then(|field| row.get(&to_camel_key(field)))
            .map(value_to_string);
        let content = cfg
            .get("contentFields")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(|fields| {
                fields
                    .split(',')
                    .filter_map(|field| {
                        row.get(&to_camel_key(field.trim()))
                            .map(value_to_string)
                            .filter(|s| !s.is_empty())
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|s| !s.is_empty());
        let permission = cfg
            .get("permission")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let route_path = cfg.get("routePath").and_then(Value::as_str);
        let owner_id = field_value(cfg, row, "ownerField");
        let dept_id = field_value(cfg, row, "deptField");
        let created_by = field_value(cfg, row, "createdByField");
        let status = cfg
            .get("statusField")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .and_then(|field| row.get(&to_camel_key(field)))
            .map(value_to_string)
            .unwrap_or_else(|| "0".to_string());

        let index_id = format!("{tenant_id}:{module_key}:{biz_id}");
        sqlx::query(
            "REPLACE INTO sys_search_index (index_id, tenant_id, module_key, module_name, biz_id, title, subtitle, content, permission, route_path, owner_id, dept_id, created_by, status, deleted, source_table, create_time, update_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())",
        )
        .bind(index_id)
        .bind(tenant_id)
        .bind(module_key)
        .bind(module_name)
        .bind(biz_id)
        .bind(title)
        .bind(subtitle)
        .bind(content)
        .bind(permission)
        .bind(route_path)
        .bind(owner_id)
        .bind(dept_id)
        .bind(created_by)
        .bind(status)
        .bind(source_table)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
        count += 1;
    }

    Ok(count)
}

fn field_value(
    cfg: &Map<String, Value>,
    row: &Map<String, Value>,
    field_name: &str,
) -> Option<String> {
    cfg.get(field_name)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .and_then(|field| row.get(&to_camel_key(field)))
        .map(value_to_string)
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

fn quote_ident(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}
