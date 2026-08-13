use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub user_id: String,
    pub tenant_id: String,
    pub username: String,
    pub perms: Vec<String>,
    pub jti: String,
    pub token_type: String,
    pub exp: usize,
    pub iat: usize,
}

fn base_claims(
    user_id: String,
    tenant_id: String,
    username: String,
    perms: Vec<String>,
    token_type: &str,
) -> Claims {
    let now = Utc::now();
    let exp = now
        + Duration::seconds(if token_type == "access" {
            15 * 60
        } else {
            7 * 24 * 3600
        });
    Claims {
        sub: user_id.clone(),
        user_id,
        tenant_id,
        username,
        perms,
        jti: Uuid::new_v4().to_string(),
        token_type: token_type.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    }
}

pub fn sign_access(
    user_id: &str,
    tenant_id: &str,
    username: &str,
    perms: Vec<String>,
    secret: &str,
) -> anyhow::Result<String> {
    sign(
        base_claims(
            user_id.to_string(),
            tenant_id.to_string(),
            username.to_string(),
            perms,
            "access",
        ),
        secret,
    )
}

pub fn sign_refresh(
    user_id: &str,
    tenant_id: &str,
    username: &str,
    perms: Vec<String>,
    secret: &str,
) -> anyhow::Result<String> {
    sign(
        base_claims(
            user_id.to_string(),
            tenant_id.to_string(),
            username.to_string(),
            perms,
            "refresh",
        ),
        secret,
    )
}

fn sign(claims: Claims, secret: &str) -> anyhow::Result<String> {
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn verify_access(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let claims = verify(token, secret)?;
    anyhow::ensure!(claims.token_type == "access", "invalid token type");
    Ok(claims)
}

pub fn verify_refresh(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let claims = verify(token, secret)?;
    anyhow::ensure!(claims.token_type == "refresh", "invalid token type");
    Ok(claims)
}

fn verify(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )?;
    Ok(data.claims)
}

pub fn parse_bearer(authorization: Option<&str>) -> Option<&str> {
    let value = authorization?;
    let (scheme, token) = value.split_once(' ')?;
    if scheme.eq_ignore_ascii_case("Bearer") {
        Some(token)
    } else {
        None
    }
}
