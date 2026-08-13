pub mod jwt;
pub mod password;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::error::AppError;
use crate::security::session::SessionCenter;
use crate::state::AppState;

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: String,
    pub tenant_id: String,
    pub username: String,
    pub perms: Vec<String>,
    pub jti: String,
}

impl AuthUser {
    pub fn is_platform(&self) -> bool {
        self.tenant_id == "000000"
    }

    pub fn has_perm(&self, perm: &str) -> bool {
        self.is_platform() || self.perms.iter().any(|p| p == "*" || p == perm)
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok());
        let token = jwt::parse_bearer(auth_header)
            .ok_or_else(|| AppError::Unauthorized("缺少访问令牌".into()))?;
        let claims = jwt::verify_access(token, &state.config.jwt.secret)
            .map_err(|_| AppError::Unauthorized("令牌无效或已过期".into()))?;

        let user = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT username, nickname, status, is_admin FROM sys_user WHERE user_id = ? AND tenant_id = ? AND deleted = 0",
        )
        .bind(&claims.user_id)
        .bind(&claims.tenant_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::Unauthorized("用户不存在".into()))?;

        let (username, nickname, status, is_admin) = user;
        if status != "0" {
            return Err(AppError::Unauthorized("账户已停用".into()));
        }

        let session_id = format!("acc:{}", claims.jti);
        if !SessionCenter::validate(&state, &claims.tenant_id, &claims.user_id, &session_id).await {
            return Err(AppError::Unauthorized("?????".into()));
        }

        let perms = if claims.tenant_id == "000000" || is_admin == "1" {
            vec!["*".to_string()]
        } else {
            sqlx::query_scalar::<_, String>(
                "SELECT DISTINCT m.perms FROM sys_user_role ur
                 JOIN sys_role_menu rm ON rm.role_id = ur.role_id
                 JOIN sys_menu m ON m.menu_id = rm.menu_id
                 WHERE ur.user_id = ? AND m.perms IS NOT NULL AND m.perms <> ''",
            )
            .bind(&claims.user_id)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
        };

        Ok(Self {
            user_id: claims.user_id,
            tenant_id: claims.tenant_id,
            username: if username.is_empty() {
                nickname
            } else {
                username
            },
            perms,
            jti: claims.jti,
        })
    }
}
