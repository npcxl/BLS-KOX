use serde_json::{Map, Value};
use sqlx::mysql::{MySqlPool, MySqlRow};
use sqlx::{Column, Row, Value as SqlxValue, ValueRef};

pub fn row_to_json(row: &MySqlRow) -> Value {
    let mut map = Map::new();
    for i in 0..row.len() {
        let name = row.column(i).name().to_string();
        let value = value_ref_to_json(row.try_get_raw(i));
        map.insert(crate::utils::case::to_camel_key(&name), value);
    }
    Value::Object(map)
}

pub fn rows_to_json(rows: Vec<MySqlRow>) -> Vec<Value> {
    rows.into_iter().map(|r| row_to_json(&r)).collect()
}

fn value_ref_to_json(value: Result<sqlx::mysql::MySqlValueRef<'_>, sqlx::Error>) -> Value {
    let Ok(raw) = value else {
        return Value::Null;
    };
    if raw.is_null() {
        return Value::Null;
    }

    let type_name = raw.type_info().to_string().to_ascii_uppercase();
    let owned = ValueRef::to_owned(&raw);

    if type_name == "JSON" {
        return owned.try_decode_unchecked::<Value>().unwrap_or(Value::Null);
    }

    let as_string = || {
        owned
            .try_decode_unchecked::<String>()
            .ok()
            .unwrap_or_default()
    };

    match type_name.as_str() {
        "BOOLEAN" => owned
            .try_decode_unchecked::<bool>()
            .ok()
            .map(Value::Bool)
            .or_else(|| as_string().parse::<i64>().ok().map(|n| Value::Bool(n != 0)))
            .unwrap_or_else(|| Value::String(as_string())),
        "TINYINT" | "SMALLINT" | "MEDIUMINT" | "INT" | "BIGINT" | "YEAR" => owned
            .try_decode_unchecked::<i64>()
            .ok()
            .map(Value::from)
            .or_else(|| as_string().parse::<i64>().ok().map(Value::from))
            .unwrap_or_else(|| Value::String(as_string())),
        "TINYINT UNSIGNED" | "SMALLINT UNSIGNED" | "MEDIUMINT UNSIGNED" | "INT UNSIGNED"
        | "BIGINT UNSIGNED" => owned
            .try_decode_unchecked::<u64>()
            .ok()
            .map(Value::from)
            .or_else(|| as_string().parse::<u64>().ok().map(Value::from))
            .unwrap_or_else(|| Value::String(as_string())),
        "FLOAT" | "DOUBLE" | "DECIMAL" => owned
            .try_decode_unchecked::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .or_else(|| {
                as_string()
                    .parse::<f64>()
                    .ok()
                    .and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
            })
            .unwrap_or_else(|| Value::String(as_string())),
        _ => Value::String(as_string()),
    }
}

pub async fn fetch_all(pool: &MySqlPool, sql: &str) -> anyhow::Result<Vec<Value>> {
    let rows = sqlx::query(sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| row_to_json(&r)).collect())
}
