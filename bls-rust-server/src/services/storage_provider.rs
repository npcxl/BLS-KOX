use std::collections::BTreeMap;

use chrono::Utc;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::AppError;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub storage_id: String,
    pub tenant_id: String,
    pub storage_name: String,
    pub storage_type: String,
    pub endpoint: Option<String>,
    pub region: Option<String>,
    pub port: Option<i64>,
    pub use_ssl: bool,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    pub public_bucket: Option<String>,
    pub private_bucket: Option<String>,
    pub public_base_url: Option<String>,
    pub private_base_url: Option<String>,
    pub path_style: bool,
    pub is_default: bool,
    pub status: String,
}

impl StorageConfig {
    pub fn from_row(value: Value) -> Option<Self> {
        Some(Self {
            storage_id: value.get("storageId")?.as_str()?.to_string(),
            tenant_id: value
                .get("tenantId")
                .and_then(Value::as_str)
                .unwrap_or("000000")
                .to_string(),
            storage_name: value
                .get("storageName")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            storage_type: value
                .get("storageType")
                .and_then(Value::as_str)
                .unwrap_or("local")
                .to_string(),
            endpoint: value
                .get("endpoint")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            region: value
                .get("region")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            port: value.get("port").and_then(Value::as_i64),
            use_ssl: value.get("useSsl").and_then(Value::as_i64).unwrap_or(0) != 0,
            access_key: value
                .get("accessKey")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            secret_key: value
                .get("secretKey")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            public_bucket: value
                .get("publicBucket")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            private_bucket: value
                .get("privateBucket")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            public_base_url: value
                .get("publicBaseUrl")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            private_base_url: value
                .get("privateBaseUrl")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            path_style: value.get("pathStyle").and_then(Value::as_i64).unwrap_or(1) != 0,
            is_default: value.get("isDefault").and_then(Value::as_i64).unwrap_or(0) != 0,
            status: value
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("0")
                .to_string(),
        })
    }

    pub fn bucket(&self, access_type: &str) -> Option<String> {
        if access_type == "public" {
            self.public_bucket
                .clone()
                .or_else(|| self.private_bucket.clone())
        } else {
            self.private_bucket
                .clone()
                .or_else(|| self.public_bucket.clone())
        }
    }
}

pub struct UploadedObject {
    pub bucket_name: String,
    pub object_name: String,
    pub url: Option<String>,
    pub provider: String,
}

pub async fn upload(
    config: &StorageConfig,
    tenant_id: &str,
    access_type: &str,
    module_name: Option<&str>,
    original_name: &str,
    safe_name: &str,
    mime_type: Option<&str>,
    data: &[u8],
    local_root: &str,
) -> Result<UploadedObject, AppError> {
    match config.storage_type.as_str() {
        "local" => {
            upload_local(
                config,
                tenant_id,
                access_type,
                module_name,
                original_name,
                safe_name,
                mime_type,
                data,
                local_root,
            )
            .await
        }
        "minio" | "aws_s3" | "aliyun_oss" | "tencent_cos" | "qiniu_kodo" | "huawei_obs" => {
            upload_s3(
                config,
                tenant_id,
                access_type,
                module_name,
                safe_name,
                mime_type,
                data,
            )
            .await
        }
        other => Err(AppError::BadRequest(format!(
            "unsupported storage type: {other}"
        ))),
    }
}

async fn upload_local(
    _config: &StorageConfig,
    tenant_id: &str,
    access_type: &str,
    module_name: Option<&str>,
    original_name: &str,
    safe_name: &str,
    _mime_type: Option<&str>,
    data: &[u8],
    local_root: &str,
) -> Result<UploadedObject, AppError> {
    let prefix = module_name.unwrap_or("files");
    let object_name = format!("{tenant_id}/{prefix}/{safe_name}");
    let path = std::path::Path::new(local_root).join(&object_name);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    tokio::fs::write(&path, data)
        .await
        .map_err(AppError::from)?;
    Ok(UploadedObject {
        bucket_name: "local".to_string(),
        object_name: format!("{object_name}_{}", original_name),
        url: Some(format!("/files/{object_name}")),
        provider: "local".to_string(),
    })
}

async fn upload_s3(
    config: &StorageConfig,
    tenant_id: &str,
    access_type: &str,
    module_name: Option<&str>,
    safe_name: &str,
    mime_type: Option<&str>,
    data: &[u8],
) -> Result<UploadedObject, AppError> {
    let bucket = config
        .bucket(access_type)
        .ok_or_else(|| AppError::BadRequest("storage bucket is not configured".into()))?;
    let prefix = module_name.unwrap_or("files");
    let object_name = format!("{tenant_id}/{prefix}/{safe_name}");
    let endpoint = config
        .endpoint
        .clone()
        .unwrap_or_else(|| "localhost".to_string());
    let base_url = normalize_base_url(&endpoint, config.port, config.use_ssl);
    let host = hostname_from_base(&base_url);
    let uri = if config.path_style {
        format!("/{bucket}/{object_name}")
    } else {
        format!("/{object_name}")
    };

    let payload_hash = hex::encode(Sha256::digest(data));
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = now.format("%Y%m%d").to_string();
    let region = config
        .region
        .clone()
        .unwrap_or_else(|| "us-east-1".to_string());
    let content_type = mime_type.unwrap_or("application/octet-stream").to_string();

    let mut headers = BTreeMap::new();
    headers.insert("content-type".to_string(), content_type.clone());
    headers.insert("host".to_string(), host.clone());
    headers.insert("x-amz-content-sha256".to_string(), payload_hash.clone());
    headers.insert("x-amz-date".to_string(), amz_date.clone());

    let signed_headers = headers.keys().cloned().collect::<Vec<_>>().join(";");
    let canonical_headers = headers
        .iter()
        .map(|(k, v)| format!("{k}:{v}\n"))
        .collect::<String>();
    let canonical_request =
        format!("PUT\n{uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}");
    let scope = format!("{date}/{region}/s3/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );
    let access_key = config
        .access_key
        .clone()
        .ok_or_else(|| AppError::BadRequest("storage access key is missing".into()))?;
    let secret_key = config
        .secret_key
        .clone()
        .ok_or_else(|| AppError::BadRequest("storage secret key is missing".into()))?;
    let signing_key = signing_key(&secret_key, &date, &region);
    let signature = hmac_hex(&signing_key, string_to_sign.as_bytes());
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
    );

    let request_url = format!("{base_url}{uri}");
    let response = reqwest::Client::new()
        .put(&request_url)
        .header("Authorization", authorization)
        .header("Content-Type", content_type)
        .header("X-Amz-Content-Sha256", payload_hash)
        .header("X-Amz-Date", amz_date)
        .body(data.to_vec())
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "storage upload failed: HTTP {status}: {body}"
        )));
    }

    let url = if access_type == "public" {
        config
            .public_base_url
            .clone()
            .or_else(|| config.private_base_url.clone())
            .map(|base| format!("{}/{}", base.trim_end_matches('/'), object_name))
    } else {
        config
            .private_base_url
            .clone()
            .or_else(|| config.public_base_url.clone())
            .map(|base| format!("{}/{}", base.trim_end_matches('/'), object_name))
    };

    Ok(UploadedObject {
        bucket_name: bucket,
        object_name,
        url,
        provider: config.storage_type.clone(),
    })
}

fn normalize_base_url(endpoint: &str, port: Option<i64>, use_ssl: bool) -> String {
    if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        return endpoint.trim_end_matches('/').to_string();
    }
    let scheme = if use_ssl { "https" } else { "http" };
    match port {
        Some(port) => format!("{scheme}://{endpoint}:{port}"),
        None => format!("{scheme}://{endpoint}"),
    }
}

fn hostname_from_base(base_url: &str) -> String {
    base_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("localhost")
        .to_string()
}

fn signing_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let k_date = hmac_bytes(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let k_region = hmac_bytes(&k_date, region.as_bytes());
    let k_service = hmac_bytes(&k_region, b"s3");
    hmac_bytes(&k_service, b"aws4_request")
}

fn hmac_bytes(key: &[u8], value: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(value);
    mac.finalize().into_bytes().to_vec()
}

fn hmac_hex(key: &[u8], value: &[u8]) -> String {
    hex::encode(hmac_bytes(key, value))
}
