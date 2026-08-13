use crate::error::{AppError, AppResult};

pub fn validate_extension(filename: &str, allowed: &str) -> AppResult<()> {
    if allowed == "*" || allowed.trim().is_empty() {
        return Ok(());
    }
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed: Vec<&str> = allowed
        .split(',')
        .map(|s| s.trim().trim_start_matches('.'))
        .collect();
    if allowed.iter().any(|a| a.eq_ignore_ascii_case(&ext)) {
        Ok(())
    } else {
        Err(AppError::BadRequest("不允许的文件类型".into()))
    }
}
