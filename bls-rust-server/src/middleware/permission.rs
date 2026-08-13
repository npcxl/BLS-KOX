use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub async fn require_perm(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
    perm: &'static str,
) -> Result<Response, AppError> {
    let Some(user) = request.extensions().get::<AuthUser>().cloned() else {
        return Err(AppError::Unauthorized("缺少用户上下文".into()));
    };
    if !user.has_perm(perm) {
        return Err(AppError::Forbidden("权限不足".into()));
    }
    let response = next.run(request).await;
    Ok(response)
}

pub fn ensure_perm(user: &AuthUser, perm: &str) -> AppResult<()> {
    if user.has_perm(perm) {
        Ok(())
    } else {
        Err(AppError::Forbidden("权限不足".into()))
    }
}
