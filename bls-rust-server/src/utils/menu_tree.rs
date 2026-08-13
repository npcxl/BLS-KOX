use std::collections::HashMap;

use serde_json::{Map, Value};

pub fn build_tree(rows: Vec<Value>, parent_field: &str, id_field: &str) -> Vec<Value> {
    let mut children: HashMap<String, Vec<String>> = HashMap::new();
    let mut nodes: HashMap<String, Value> = HashMap::new();

    for row in rows {
        let id = row
            .get(id_field)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let parent = row
            .get(parent_field)
            .and_then(Value::as_str)
            .unwrap_or("0")
            .to_string();
        nodes.insert(id.clone(), row);
        children.entry(parent).or_default().push(id);
    }

    let mut root_ids = children.remove("0").unwrap_or_default();
    let orphan_parents: Vec<String> = children
        .keys()
        .filter(|parent| !nodes.contains_key(*parent))
        .cloned()
        .collect();
    for parent in orphan_parents {
        if let Some(ids) = children.remove(&parent) {
            root_ids.extend(ids);
        }
    }

    fn sort_and_build(
        ids: Vec<String>,
        nodes: &HashMap<String, Value>,
        children: &mut HashMap<String, Vec<String>>,
        id_field: &str,
    ) -> Vec<Value> {
        let mut ids = ids;
        ids.sort_by_key(|id| {
            nodes
                .get(id)
                .and_then(|n| n.get("sortNum").and_then(Value::as_u64))
                .unwrap_or(0)
        });

        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            let Some(mut node) = nodes.get(&id).cloned() else {
                continue;
            };
            let child_ids = children.remove(&id).unwrap_or_default();
            let child_values = sort_and_build(child_ids, nodes, children, id_field);
            if let Some(obj) = node.as_object_mut() {
                obj.insert("children".to_string(), Value::Array(child_values));
            }
            out.push(node);
        }
        out
    }

    sort_and_build(root_ids, &nodes, &mut children, id_field)
}

pub fn _ensure_children(value: &mut Value) {
    if let Some(obj) = value.as_object_mut() {
        obj.entry("children".to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
    }
}

#[allow(dead_code)]
fn _unused(_: &Map<String, Value>) {}
