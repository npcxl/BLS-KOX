use serde_json::{Map, Value};
use std::collections::HashSet;

pub fn pick_fields(body: &Value, allowed: &[&str]) -> Map<String, Value> {
    let allowed: HashSet<&str> = allowed.iter().copied().collect();
    match body {
        Value::Object(map) => map
            .iter()
            .filter(|(k, _)| allowed.contains(k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        _ => Map::new(),
    }
}
