use axum::Json;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub code: u16,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
}

#[derive(Debug, Serialize)]
pub struct PageResponse<T> {
    pub code: u16,
    pub message: String,
    pub data: Option<T>,
    pub total: u64,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            code: 200,
            message: "操作成功".to_string(),
            data: Some(data),
        }
    }
    pub fn message_only(message: impl Into<String>) -> Self {
        Self {
            code: 200,
            message: message.into(),
            data: None,
        }
    }
    pub fn success_with_message(data: T, message: impl Into<String>) -> Self {
        Self {
            code: 200,
            message: message.into(),
            data: Some(data),
        }
    }
}

impl<T: Serialize> PageResponse<T> {
    pub fn success(data: T, total: u64) -> Self {
        Self {
            code: 200,
            message: "查询成功".to_string(),
            data: Some(data),
            total,
        }
    }
}

impl<T: Serialize> IntoResponse for ApiResponse<T> {
    fn into_response(self) -> Response {
        Json(self).into_response()
    }
}

impl<T: Serialize> IntoResponse for PageResponse<T> {
    fn into_response(self) -> Response {
        Json(self).into_response()
    }
}
