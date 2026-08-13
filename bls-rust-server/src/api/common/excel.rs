use std::collections::HashMap;

use axum::body::Body;
use axum::extract::{Multipart, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use calamine::{Data, Reader, open_workbook_auto};
use rust_xlsxwriter::{Format, Workbook};
use serde_json::{Map, Value};
use sqlx::Row;

use crate::api_response::ApiResponse;
use crate::auth::AuthUser;
use crate::db::query::rows_to_json;
use crate::error::AppError;
use crate::state::AppState;
use crate::utils::case::{to_camel_key, to_snake_key};

const MAX_EXPORT: i64 = 10000;
const SKIP_IMPORT: &[&str] = &[
    "userId",
    "user_id",
    "roleIds",
    "password",
    "createTime",
    "create_time",
    "updateTime",
    "update_time",
    "createBy",
    "create_by",
    "updateBy",
    "update_by",
    "deptId",
    "dept_id",
    "tenantId",
    "tenant_id",
];

#[derive(Clone, Copy)]
struct ExcelMeta {
    meta_key: &'static str,
    table_name: &'static str,
    page_code: &'static str,
    tenant_aware: bool,
}

const EXCEL_METAS: &[ExcelMeta] = &[
    ExcelMeta {
        meta_key: "system-user",
        table_name: "sys_user",
        page_code: "system_user",
        tenant_aware: true,
    },
    ExcelMeta {
        meta_key: "system-config",
        table_name: "sys_config",
        page_code: "system_config",
        tenant_aware: true,
    },
    ExcelMeta {
        meta_key: "system-role",
        table_name: "sys_role",
        page_code: "system_role",
        tenant_aware: true,
    },
    ExcelMeta {
        meta_key: "system-dept",
        table_name: "sys_dept",
        page_code: "system_dept",
        tenant_aware: true,
    },
    ExcelMeta {
        meta_key: "system-tenant",
        table_name: "sys_tenant",
        page_code: "system_tenant",
        tenant_aware: true,
    },
    ExcelMeta {
        meta_key: "system-package",
        table_name: "sys_package",
        page_code: "system_package",
        tenant_aware: true,
    },
];

#[derive(Clone)]
struct ColumnDef {
    data_index: String,
    title: String,
    visible: bool,
    required: bool,
    value_enum_code: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/export", post(export))
        .route("/template", get(template))
        .route("/import", post(import))
}

fn meta_by_key(key: &str) -> Option<ExcelMeta> {
    EXCEL_METAS.iter().copied().find(|m| m.meta_key == key)
}

async fn load_columns(
    state: &AppState,
    page_code: &str,
    include_hidden: bool,
) -> Result<Vec<ColumnDef>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM sys_page_column_config WHERE page_code = ? AND deleted = 0 ORDER BY order_num ASC",
    )
    .bind(page_code)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let values = rows_to_json(rows);
    let mut cols = Vec::new();
    for value in values {
        let Some(obj) = value.as_object() else {
            continue;
        };
        let visible = obj.get("visible").and_then(Value::as_i64).unwrap_or(1) != 0;
        if !include_hidden && !visible {
            continue;
        }
        let data_index = obj
            .get("dataIndex")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if data_index.is_empty() || data_index == "roleIds" || data_index == "password" {
            continue;
        }
        cols.push(ColumnDef {
            data_index,
            title: obj
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            visible,
            required: obj.get("required").and_then(Value::as_i64).unwrap_or(0) != 0,
            value_enum_code: obj
                .get("valueEnumCode")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        });
    }
    Ok(cols)
}

async fn load_dict_maps(
    state: &AppState,
    cols: &[ColumnDef],
) -> Result<
    (
        HashMap<String, HashMap<String, String>>,
        HashMap<String, HashMap<String, String>>,
    ),
    AppError,
> {
    let codes = cols
        .iter()
        .filter_map(|c| c.value_enum_code.clone())
        .collect::<Vec<_>>();
    if codes.is_empty() {
        return Ok((HashMap::new(), HashMap::new()));
    }

    let placeholders = vec!["?"; codes.len()].join(", ");
    let sql = format!(
        "SELECT dict_type_id, dict_type FROM sys_dict_type WHERE dict_type IN ({placeholders})"
    );
    let mut query = sqlx::query(&sql);
    for code in &codes {
        query = query.bind(code.clone());
    }
    let type_rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    let mut type_id_by_code: HashMap<String, String> = HashMap::new();
    for row in type_rows {
        type_id_by_code.insert(
            row.get::<String, _>("dict_type"),
            row.get::<String, _>("dict_type_id"),
        );
    }
    if type_id_by_code.is_empty() {
        return Ok((HashMap::new(), HashMap::new()));
    }

    let type_ids = type_id_by_code.values().cloned().collect::<Vec<_>>();
    let placeholders = vec!["?"; type_ids.len()].join(", ");
    let sql = format!(
        "SELECT dict_type_id, dict_label, dict_value FROM sys_dict_data WHERE dict_type_id IN ({placeholders}) AND deleted = 0 ORDER BY dict_sort ASC"
    );
    let mut query = sqlx::query(&sql);
    for id in &type_ids {
        query = query.bind(id.clone());
    }
    let data_rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;

    let mut v2l: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut l2v: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut type_code_by_id: HashMap<String, String> = HashMap::new();
    for (code, id) in type_id_by_code {
        type_code_by_id.insert(id, code);
    }
    for row in data_rows {
        let Some(type_code) = type_code_by_id
            .get(&row.get::<String, _>("dict_type_id"))
            .cloned()
        else {
            continue;
        };
        let label = row.get::<String, _>("dict_label");
        let value = row.get::<String, _>("dict_value");
        v2l.entry(type_code.clone())
            .or_default()
            .insert(value.clone(), label.clone());
        l2v.entry(type_code).or_default().insert(label, value);
    }
    Ok((v2l, l2v))
}

async fn export(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Result<Response, AppError> {
    let meta_key = body
        .get("metaKey")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let meta = meta_by_key(&meta_key).ok_or_else(|| AppError::BadRequest("???????".into()))?;
    let cols = load_columns(&state, meta.page_code, false).await?;
    if cols.is_empty() {
        return Err(AppError::BadRequest("???????".into()));
    }
    let (v2l, _) = load_dict_maps(&state, &cols).await?;

    let safe_table = quote_ident(meta.table_name);
    let mut sql = format!("SELECT * FROM {safe_table} WHERE deleted = 0");
    let mut binds: Vec<Value> = Vec::new();
    if meta.tenant_aware {
        sql.push_str(" AND tenant_id = ?");
        binds.push(Value::String(user.tenant_id.clone()));
    }

    if let Some(keyword) = body
        .get("keyword")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        let searchable = cols
            .iter()
            .filter(|c| body.get(&c.data_index).is_none())
            .map(|_| ())
            .count();
        let _ = searchable;
        let mut parts = Vec::new();
        for col in &cols {
            let field = to_snake_key(&col.data_index);
            parts.push(format!("{field} LIKE ?"));
            binds.push(Value::String(format!("%{}%", keyword.trim())));
        }
        if !parts.is_empty() {
            sql.push_str(&format!(" AND ({})", parts.join(" OR ")));
        }
    }

    for col in &cols {
        if let Some(value) = body.get(&col.data_index) {
            if !value.is_null() && value.as_str().map(|s| !s.is_empty()).unwrap_or(true) {
                let field = to_snake_key(&col.data_index);
                sql.push_str(&format!(" AND {field} = ?"));
                binds.push(value.clone());
            }
        }
    }

    let limit = if body.get("exportMode").and_then(Value::as_str) == Some("limit") {
        body.get("customMaxNum")
            .and_then(Value::as_i64)
            .map(|n| n.clamp(1, MAX_EXPORT))
            .unwrap_or(MAX_EXPORT)
    } else {
        MAX_EXPORT
    };
    sql.push_str(" ORDER BY create_time DESC LIMIT ?");
    binds.push(Value::from(limit));

    let mut query = sqlx::query(&sql);
    for bind in binds {
        query = query.bind(bind);
    }
    let rows = query.fetch_all(&state.db).await.map_err(AppError::from)?;
    let rows = rows_to_json(rows);

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name(&meta_key).map_err(xlsx_error)?;
    let bold = Format::new().set_bold();
    for (idx, col) in cols.iter().enumerate() {
        worksheet
            .write_string_with_format(0, idx as u16, &col.title, &bold)
            .map_err(xlsx_error)?;
        worksheet
            .set_column_width(
                idx as u16,
                (col.title.chars().count() as u16).clamp(10, 30) * 2,
            )
            .map_err(xlsx_error)?;
    }

    for (row_idx, value) in rows.iter().enumerate() {
        let Some(row) = value.as_object() else {
            continue;
        };
        for (col_idx, col) in cols.iter().enumerate() {
            let field = to_snake_key(&col.data_index);
            let raw = row
                .get(&to_camel_key(&field))
                .or_else(|| row.get(&col.data_index))
                .cloned()
                .unwrap_or(Value::Null);
            let raw = apply_dict(&raw, col, &v2l);
            let text = value_to_string(&raw);
            worksheet
                .write_string_with_format(
                    (row_idx + 1) as u32,
                    col_idx as u16,
                    &text,
                    &Format::new(),
                )
                .map_err(xlsx_error)?;
        }
    }

    let bytes = workbook.save_to_buffer().map_err(xlsx_error)?;
    Ok(xlsx_response(bytes, &format!("{meta_key}-export.xlsx")))
}

async fn template(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(q): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let meta_key = q.get("metaKey").cloned().unwrap_or_default();
    let meta = meta_by_key(&meta_key).ok_or_else(|| AppError::BadRequest("???????".into()))?;
    let mut cols = load_columns(&state, meta.page_code, true).await?;
    cols.retain(|c| !SKIP_IMPORT.contains(&c.data_index.as_str()));
    if cols.is_empty() {
        return Err(AppError::BadRequest("???????".into()));
    }

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name(&meta_key).map_err(xlsx_error)?;
    let bold = Format::new().set_bold();
    for (idx, col) in cols.iter().enumerate() {
        let title = if col.required {
            format!("{}????", col.title)
        } else {
            col.title.clone()
        };
        worksheet
            .write_string_with_format(0, idx as u16, &title, &bold)
            .map_err(xlsx_error)?;
        worksheet
            .set_column_width(idx as u16, (title.chars().count() as u16).clamp(12, 30) * 2)
            .map_err(xlsx_error)?;
    }

    let bytes = workbook.save_to_buffer().map_err(xlsx_error)?;
    Ok(xlsx_response(bytes, &format!("{meta_key}-template.xlsx")))
}

async fn import(
    State(state): State<AppState>,
    user: AuthUser,
    mut multipart: Multipart,
) -> Result<ApiResponse<Value>, AppError> {
    let mut meta_key = String::new();
    let mut file_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "metaKey" {
            meta_key = field
                .text()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
        } else if name == "file" {
            file_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?
                    .to_vec(),
            );
        }
    }

    let meta = meta_by_key(&meta_key).ok_or_else(|| AppError::BadRequest("???????".into()))?;
    let file_bytes = file_bytes.ok_or_else(|| AppError::BadRequest("???Excel??".into()))?;
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(format!(
        "bls-excel-import-{}.xlsx",
        state.snowflake.next_id()?
    ));
    std::fs::write(&file_path, &file_bytes)?;
    let result = import_xlsx(
        &state,
        &user,
        meta,
        &cols_for_import(&state, meta.page_code).await?,
        &file_path,
    )
    .await;
    let _ = std::fs::remove_file(&file_path);
    result
}

async fn cols_for_import(state: &AppState, page_code: &str) -> Result<Vec<ColumnDef>, AppError> {
    let mut cols = load_columns(state, page_code, true).await?;
    cols.retain(|c| !SKIP_IMPORT.contains(&c.data_index.as_str()));
    Ok(cols)
}

async fn import_xlsx(
    state: &AppState,
    user: &AuthUser,
    meta: ExcelMeta,
    import_cols: &[ColumnDef],
    path: &std::path::Path,
) -> Result<ApiResponse<Value>, AppError> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| AppError::BadRequest(format!("????Excel??: {e}")))?;
    let sheet_name = workbook.sheet_names().first().cloned().unwrap_or_default();
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| AppError::BadRequest(format!("???????: {e}")))?;
    let rows = range.rows().collect::<Vec<_>>();
    if rows.is_empty() {
        return Err(AppError::BadRequest("????".into()));
    }

    let (_, l2v) = load_dict_maps(state, import_cols).await?;
    let header = &rows[0];
    let mut col_map: HashMap<usize, &ColumnDef> = HashMap::new();
    for (idx, cell) in header.iter().enumerate() {
        let header_text = normalize_header(&data_to_string(cell));
        if let Some(col) = import_cols
            .iter()
            .find(|c| normalize_header(&c.title) == header_text)
        {
            col_map.insert(idx, col);
        }
    }
    if col_map.is_empty() {
        return Err(AppError::BadRequest("????????????????".into()));
    }

    let mut errors = Vec::new();
    let mut success_count = 0usize;
    for (row_idx, row) in rows.iter().enumerate().skip(1) {
        let mut row_data = Map::new();
        let mut row_errors = Vec::new();
        let mut has_value = false;

        for (col_idx, col) in &col_map {
            let value = row.get(*col_idx).map(data_to_string).unwrap_or_default();
            let value = value.trim().to_string();
            if col.required && value.is_empty() {
                row_errors.push(format!("{}????", col.title));
                continue;
            }
            if value.is_empty() {
                continue;
            }
            has_value = true;

            if let Some(code) = &col.value_enum_code {
                if let Some(mapped) = l2v.get(code).and_then(|m| m.get(&value)) {
                    row_data.insert(col.data_index.clone(), Value::String(mapped.clone()));
                    continue;
                }
            }
            row_data.insert(col.data_index.clone(), Value::String(value));
        }

        if !has_value {
            continue;
        }
        if !row_errors.is_empty() {
            errors.push(serde_json::json!({
                "rowNumber": row_idx + 1,
                "errors": row_errors,
                "raw": row_data,
            }));
            continue;
        }

        let mut snake = Map::new();
        for (key, value) in &row_data {
            snake.insert(to_snake_key(key), value.clone());
        }
        snake.insert("deleted".to_string(), Value::from(0));
        if meta.tenant_aware {
            snake.insert(
                "tenant_id".to_string(),
                Value::String(user.tenant_id.clone()),
            );
        }
        if meta.table_name == "sys_user" {
            snake
                .entry("password".to_string())
                .or_insert_with(|| Value::String("e10adc3949ba59abbe56e057f20f883e".to_string()));
            snake
                .entry("gender".to_string())
                .or_insert_with(|| Value::String("2".to_string()));
        }

        match upsert_row(state, user, meta, &snake).await {
            Ok(_) => success_count += 1,
            Err(err) => errors.push(serde_json::json!({
                "rowNumber": row_idx + 1,
                "errors": [err.to_string()],
                "raw": row_data,
            })),
        }
    }

    Ok(ApiResponse::success(serde_json::json!({
        "successCount": success_count,
        "failedCount": errors.len(),
        "totalCount": success_count + errors.len(),
        "errorRows": errors.into_iter().take(50).collect::<Vec<_>>(),
    })))
}

async fn upsert_row(
    state: &AppState,
    user: &AuthUser,
    meta: ExcelMeta,
    row: &Map<String, Value>,
) -> Result<(), AppError> {
    let pk_field = pk_for_table(meta.table_name);
    let unique_field = if meta.table_name == "sys_user" {
        Some("username")
    } else if meta.table_name == "sys_role" {
        Some("role_name")
    } else if meta.table_name == "sys_config" {
        Some("config_key")
    } else if meta.table_name == "sys_dept" {
        Some("dept_name")
    } else if meta.table_name == "sys_tenant" {
        Some("tenant_name")
    } else if meta.table_name == "sys_package" {
        Some("package_name")
    } else {
        None
    };

    let existing_id = if let Some(unique_field) = unique_field {
        let unique_value = match row.get(unique_field).and_then(Value::as_str) {
            Some(value) => value.to_string(),
            None => String::new(),
        };
        if unique_value.is_empty() {
            None
        } else {
            let sql = format!(
                "SELECT {pk_field} FROM {} WHERE {unique_field} = ? AND tenant_id = ? AND deleted = 0 LIMIT 1",
                quote_ident(meta.table_name)
            );
            sqlx::query_scalar::<_, String>(&sql)
                .bind(unique_value)
                .bind(&user.tenant_id)
                .fetch_optional(&state.db)
                .await
                .map_err(AppError::from)?
        }
    } else {
        None
    };

    if let Some(existing_id) = existing_id {
        let mut sets = Vec::new();
        let mut binds = Vec::new();
        for (key, value) in row {
            if key == pk_field || key == "tenant_id" || key == "create_time" || key == "deleted" {
                continue;
            }
            sets.push(format!("{} = ?", quote_ident(key)));
            binds.push(value.clone());
        }
        if sets.is_empty() {
            return Ok(());
        }
        let sql = format!(
            "UPDATE {} SET {} WHERE {pk_field} = ? AND tenant_id = ?",
            quote_ident(meta.table_name),
            sets.join(", ")
        );
        let mut query = sqlx::query(&sql);
        for bind in binds {
            query = query.bind(bind);
        }
        query = query.bind(existing_id).bind(&user.tenant_id);
        query.execute(&state.db).await.map_err(AppError::from)?;
    } else {
        let mut row = row.clone();
        if !row.contains_key(pk_field) {
            row.insert(
                pk_field.to_string(),
                Value::String(state.snowflake.next_id()?),
            );
        }
        let columns = row.keys().cloned().collect::<Vec<_>>();
        let placeholders = vec!["?"; columns.len()].join(", ");
        let column_sql = columns
            .iter()
            .map(|c| quote_ident(c))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {} ({column_sql}) VALUES ({placeholders})",
            quote_ident(meta.table_name)
        );
        let mut query = sqlx::query(&sql);
        for column in &columns {
            query = query.bind(row.get(column).cloned().unwrap_or(Value::Null));
        }
        query.execute(&state.db).await.map_err(AppError::from)?;
    }
    Ok(())
}

fn pk_for_table(table_name: &str) -> &'static str {
    match table_name {
        "sys_user" => "user_id",
        "sys_role" => "role_id",
        "sys_dept" => "dept_id",
        "sys_menu" => "menu_id",
        "sys_config" => "config_id",
        "sys_tenant" => "tenant_id",
        "sys_package" => "package_id",
        "sys_theme" => "theme_id",
        "sys_storage_config" => "storage_id",
        _ => "id",
    }
}

fn apply_dict(
    raw: &Value,
    col: &ColumnDef,
    v2l: &HashMap<String, HashMap<String, String>>,
) -> Value {
    let Some(code) = &col.value_enum_code else {
        return raw.clone();
    };
    let Some(map) = v2l.get(code) else {
        return raw.clone();
    };
    let key = value_to_string(raw);
    map.get(&key)
        .map(|label| Value::String(label.clone()))
        .unwrap_or_else(|| raw.clone())
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

fn normalize_header(value: &str) -> String {
    value
        .trim()
        .split(|c| c == '?' || c == '(')
        .next()
        .unwrap_or(value)
        .trim()
        .replace('*', "")
        .to_string()
}

fn data_to_string(data: &Data) -> String {
    match data {
        Data::String(s) => s.clone(),
        Data::Int(i) => i.to_string(),
        Data::Float(f) => {
            if f.fract() == 0.0 {
                format!("{f:.0}")
            } else {
                f.to_string()
            }
        }
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => dt.to_string(),
        Data::Error(e) => e.to_string(),
        Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
        Data::Empty => String::new(),
    }
}

fn xlsx_response(bytes: Vec<u8>, filename: &str) -> Response {
    (
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
            ),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        Body::from(bytes),
    )
        .into_response()
}

fn xlsx_error(err: rust_xlsxwriter::XlsxError) -> AppError {
    AppError::Internal(anyhow::anyhow!(err.to_string()))
}

fn quote_ident(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}
