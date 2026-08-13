use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use md5::Md5;
use sha2::{Digest, Sha256};

pub fn hash_argon2id(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!(e.to_string()))?;
    Ok(hash.to_string())
}

pub fn verify_argon2id(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

pub fn hash_md5(password: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn verify_md5(password: &str, expected: &str) -> bool {
    let candidate = if password.len() == 32 {
        password.to_string()
    } else {
        hash_md5(password)
    };
    candidate.eq_ignore_ascii_case(expected)
}

pub fn hash_sha256(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn infer_algorithm(hash: &str) -> &'static str {
    if hash.starts_with("$argon2") {
        "argon2id"
    } else {
        "md5"
    }
}

pub fn verify_password(password: &str, hash: &str, algorithm: &str) -> bool {
    if algorithm == "argon2id" {
        verify_argon2id(password, hash)
    } else {
        verify_md5(password, hash)
    }
}
