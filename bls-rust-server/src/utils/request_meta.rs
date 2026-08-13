pub fn extract_ip(forwarded_for: Option<&str>, peer: Option<&str>) -> String {
    if let Some(xff) = forwarded_for {
        if let Some(first) = xff.split(',').next() {
            return super::ip::normalize_ip(first.trim());
        }
    }
    peer.map(|s| super::ip::normalize_ip(s)).unwrap_or_default()
}
