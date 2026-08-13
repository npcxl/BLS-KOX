pub fn normalize_ip(ip: &str) -> String {
    ip.trim()
        .strip_prefix("::ffff:")
        .unwrap_or(ip.trim())
        .to_string()
}
