use axum::extract::{Path, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::Value;
use sqlx::QueryBuilder;

use crate::api_response::{ApiResponse, PageResponse};
use crate::auth::AuthUser;
use crate::db::query::row_to_json;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::utils::case::{to_camel, to_snake_key};
use crate::utils::pagination::PageParams;

#[derive(Clone, Copy)]
pub struct CrudSpec {
    pub prefix: &'static str,
    pub table: &'static str,
    pub pk: &'static str,
    pub name: &'static str,
    pub search_fields: &'static [&'static str],
    pub writable_fields: &'static [&'static str],
    pub perm_prefix: Option<&'static str>,
    pub soft_delete: bool,
    pub status_field: bool,
    pub tenant_scoped: bool,
}

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(flatten)]
    pub page: PageParams,
    #[serde(flatten)]
    pub filters: std::collections::HashMap<String, Value>,
}

pub fn crud_router(spec: CrudSpec) -> Router<AppState> {
    let list_spec = spec;
    let get_spec = spec;
    let add_spec = spec;
    let edit_spec = spec;
    let remove_spec = spec;
    let status_spec = spec;

    let mut router = Router::new()
        .route(
            "/list",
            get(
                move |state: State<AppState>, query: Query<ListQuery>, user: AuthUser| async move {
                    list(state, query, user, list_spec).await
                },
            ),
        )
        .route(
            "/{id}",
            get(
                move |state: State<AppState>, path: Path<String>, user: AuthUser| async move {
                    get_one(state, path, user, get_spec).await
                },
            ),
        )
        .route(
            "/add",
            post(
                move |state: State<AppState>, user: AuthUser, body: Json<Value>| async move {
                    add(state, user, body, add_spec).await
                },
            ),
        )
        .route(
            "/edit",
            put(
                move |state: State<AppState>, user: AuthUser, body: Json<Value>| async move {
                    edit(state, user, body, edit_spec).await
                },
            ),
        )
        .route(
            "/remove",
            delete(
                move |state: State<AppState>, user: AuthUser, body: Json<Value>| async move {
                    remove(state, user, body, remove_spec).await
                },
            ),
        );

    if spec.status_field {
        router = router.route(
            "/status",
            put(
                move |state: State<AppState>, user: AuthUser, body: Json<Value>| async move {
                    update_status(state, user, body, status_spec).await
                },
            ),
        );
    }
    router
}

fn require_perm(user: &AuthUser, spec: &CrudSpec, action: &str) -> AppResult<()> {
    if let Some(prefix) = spec.perm_prefix {
        let perm = format!("{prefix}:{action}");
        if !user.has_perm(&perm) {
            return Err(AppError::Forbidden(format!("missing permission: {perm}")));
        }
    }
    Ok(())
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
    user: AuthUser,
    spec: CrudSpec,
) -> Result<PageResponse<Vec<Value>>, AppError> {
    require_perm(&user, &spec, "list")?;
    let pool = &state.db;
    let mut count_qb = QueryBuilder::<sqlx::MySql>::new("SELECT COUNT(*) FROM ");
    count_qb.push(spec.table);
    push_where(&mut count_qb, &user, &spec);
    if let Some(kw) = query.page.keyword.as_deref().filter(|s| !s.is_empty()) {
        push_keyword(&mut count_qb, spec.search_fields, kw);
    }
    let total: i64 = count_qb
        .build_query_scalar()
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let mut qb = QueryBuilder::<sqlx::MySql>::new("SELECT * FROM ");
    qb.push(spec.table);
    push_where(&mut qb, &user, &spec);
    if let Some(kw) = query.page.keyword.as_deref().filter(|s| !s.is_empty()) {
        push_keyword(&mut qb, spec.search_fields, kw);
    }
    qb.push(" ORDER BY ")
        .push(spec.pk)
        .push(" DESC LIMIT ")
        .push_bind(query.page.limit() as i64)
        .push(" OFFSET ")
        .push_bind(query.page.offset() as i64);

    let rows = qb.build().fetch_all(pool).await.map_err(AppError::from)?;
    let data = rows.iter().map(|r| to_camel(row_to_json(r))).collect();
    Ok(PageResponse::success(data, total as u64))
}

fn push_where(qb: &mut QueryBuilder<'_, sqlx::MySql>, user: &AuthUser, spec: &CrudSpec) {
    qb.push(" WHERE 1=1");
    if spec.soft_delete {
        qb.push(" AND deleted = 0");
    }
    if spec.tenant_scoped && !user.is_platform() {
        qb.push(" AND tenant_id = ")
            .push_bind(user.tenant_id.clone());
    }
}

fn push_keyword(qb: &mut QueryBuilder<'_, sqlx::MySql>, fields: &[&str], keyword: &str) {
    if fields.is_empty() {
        return;
    }
    qb.push(" AND (");
    for (i, field) in fields.iter().enumerate() {
        if i > 0 {
            qb.push(" OR ");
        }
        qb.push(field)
            .push(" LIKE ")
            .push_bind(format!("%{keyword}%"));
    }
    qb.push(")");
}

async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
    user: AuthUser,
    spec: CrudSpec,
) -> Result<ApiResponse<Value>, AppError> {
    require_perm(&user, &spec, "list")?;
    let mut qb = QueryBuilder::<sqlx::MySql>::new("SELECT * FROM ");
    qb.push(spec.table)
        .push(" WHERE ")
        .push(spec.pk)
        .push(" = ")
        .push_bind(id);
    if spec.soft_delete {
        qb.push(" AND deleted = 0");
    }
    if spec.tenant_scoped && !user.is_platform() {
        qb.push(" AND tenant_id = ")
            .push_bind(user.tenant_id.clone());
    }
    let row = qb
        .build()
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
    let value = row
        .map(|r| to_camel(row_to_json(&r)))
        .ok_or_else(|| AppError::NotFound("record not found".into()))?;
    Ok(ApiResponse::success(value))
}

async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
    spec: CrudSpec,
) -> Result<ApiResponse<Value>, AppError> {
    require_perm(&user, &spec, "add")?;
    let snake = snake_object(&body);
    let obj = snake
        .as_object()
        .ok_or_else(|| AppError::BadRequest("request body must be an object".into()))?;
    let mut columns = vec![spec.pk.to_string()];
    let mut binds = vec![Value::String(state.snowflake.next_id()?)];
    if spec.tenant_scoped {
        columns.push("tenant_id".to_string());
        binds.push(Value::String(user.tenant_id.clone()));
    }
    for field in spec.writable_fields {
        if let Some(v) = obj.get(*field) {
            columns.push(field.to_string());
            binds.push(v.clone());
        }
    }
    if spec.soft_delete && !columns.contains(&"deleted".to_string()) {
        columns.push("deleted".to_string());
        binds.push(Value::from(0));
    }
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        spec.table,
        columns.join(", "),
        vec!["?"; columns.len()].join(", ")
    );
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only(format!("{} created", spec.name)))
}

async fn edit(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
    spec: CrudSpec,
) -> Result<ApiResponse<Value>, AppError> {
    require_perm(&user, &spec, "edit")?;
    let snake = snake_object(&body);
    let obj = snake
        .as_object()
        .ok_or_else(|| AppError::BadRequest("request body must be an object".into()))?;
    let id = id_from_body(obj, spec.pk)?;
    let mut sets = Vec::new();
    let mut binds = Vec::new();
    for field in spec.writable_fields {
        if *field == spec.pk {
            continue;
        }
        if let Some(v) = obj.get(*field) {
            sets.push(format!("{field} = ?"));
            binds.push(v.clone());
        }
    }
    if sets.is_empty() {
        return Err(AppError::BadRequest("no updatable fields".into()));
    }
    let mut sql = format!(
        "UPDATE {} SET {} WHERE {}",
        spec.table,
        sets.join(", "),
        spec.pk
    );
    if spec.tenant_scoped && !user.is_platform() {
        sql.push_str(" AND tenant_id = ?");
    }
    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    query = query.bind(id);
    if spec.tenant_scoped && !user.is_platform() {
        query = query.bind(user.tenant_id.clone());
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only(format!("{} updated", spec.name)))
}

async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
    spec: CrudSpec,
) -> Result<ApiResponse<Value>, AppError> {
    require_perm(&user, &spec, "remove")?;
    let ids = ids_from_body(&body);
    if ids.is_empty() {
        return Err(AppError::BadRequest("missing ids".into()));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let mut sql = if spec.soft_delete {
        format!(
            "UPDATE {} SET deleted = 1 WHERE {} IN ({})",
            spec.table, spec.pk, placeholders
        )
    } else {
        format!(
            "DELETE FROM {} WHERE {} IN ({})",
            spec.table, spec.pk, placeholders
        )
    };
    if spec.tenant_scoped && !user.is_platform() {
        sql.push_str(" AND tenant_id = ?");
    }
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    if spec.tenant_scoped && !user.is_platform() {
        query = query.bind(user.tenant_id.clone());
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only(format!("{} deleted", spec.name)))
}

async fn update_status(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
    spec: CrudSpec,
) -> Result<ApiResponse<Value>, AppError> {
    require_perm(&user, &spec, "status")?;
    let snake = snake_object(&body);
    let obj = snake
        .as_object()
        .ok_or_else(|| AppError::BadRequest("invalid body".into()))?;
    let id = id_from_body(obj, spec.pk)?;
    let status = obj
        .get("status")
        .or_else(|| body.get("status"))
        .cloned()
        .ok_or_else(|| AppError::BadRequest("missing status".into()))?;
    let mut sql = format!("UPDATE {} SET status = ? WHERE {}", spec.table, spec.pk);
    if spec.tenant_scoped && !user.is_platform() {
        sql.push_str(" AND tenant_id = ?");
    }
    let mut query = sqlx::query(&sql).bind(status).bind(id);
    if spec.tenant_scoped && !user.is_platform() {
        query = query.bind(user.tenant_id.clone());
    }
    query.execute(&state.db).await.map_err(AppError::from)?;
    Ok(ApiResponse::message_only("status updated"))
}

fn snake_object(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (key, value) in map {
                out.insert(to_snake_key(key), snake_object(value));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(snake_object).collect()),
        other => other.clone(),
    }
}

fn id_from_body(obj: &serde_json::Map<String, Value>, pk: &str) -> Result<String, AppError> {
    let camel = crate::utils::case::to_camel_key(pk);
    obj.get(pk)
        .or_else(|| obj.get(&camel))
        .or_else(|| obj.get("id"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::BadRequest(format!("missing primary key: {pk}")))
}

fn ids_from_body(body: &Value) -> Vec<String> {
    let ids = body
        .get("ids")
        .or_else(|| body.get("idList"))
        .unwrap_or(&Value::Null);
    match ids {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                if let Some(s) = item.as_str() {
                    Some(s.to_string())
                } else {
                    item.as_i64().map(|n| n.to_string())
                }
            })
            .collect(),
        Value::String(s) => s
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        Value::Number(n) => vec![n.to_string()],
        _ => Vec::new(),
    }
}
