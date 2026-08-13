pub fn extract_domain(origin: Option<&str>) -> String {
    origin
        .and_then(|o| url::Url::parse(o).ok())
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_default()
}
