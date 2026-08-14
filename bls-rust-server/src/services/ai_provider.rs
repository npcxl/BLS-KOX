//! AI Provider 抽象层
//!
//! 支持 OpenAI 兼容的 provider（OpenAI / DeepSeek / 通义千问 / Ollama 等）。
//! 新增 provider 只需实现 stream_complete 并返回 OpenAI 兼容的 SSE 格式。

use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;

use crate::config::AiConfig;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct AiCompletionRequest {
    pub messages: Vec<AiMessage>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default = "default_stream")]
    pub stream: bool,
}

fn default_stream() -> bool {
    true
}

/// 根据 provider 名称获取默认 base_url
fn default_base_url(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "https://api.deepseek.com/v1",
        "qwen" => "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "ollama" => "http://ollama:11434/v1",
        "openai" => "https://api.openai.com/v1",
        _ => "https://api.openai.com/v1",
    }
}

/// 调用上游 OpenAI 兼容接口，返回 SSE 流
///
/// 先发起请求，成功后再返回 SSE 流（流内部持有 resp 和 buffer，生命周期自洽）。
pub async fn stream_completions(
    config: AiConfig,
    request: AiCompletionRequest,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>, AppError> {
    let base_url = if config.base_url.is_empty() {
        default_base_url(&config.provider).to_string()
    } else {
        config.base_url.trim_end_matches('/').to_string()
    };
    let url = format!("{base_url}/chat/completions");
    let model = request.model.clone().unwrap_or_else(|| config.model.clone());
    let api_key = config.api_key.clone();
    let temperature = config.temperature;
    let timeout_ms = config.timeout_ms;
    let messages = request.messages.clone();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 4096,
        "stream": true,
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("AI 服务请求失败: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(anyhow::anyhow!("AI 服务返回错误 ({status}): {text}")));
    }

    // 将上游字节流转成文本流，逐行解析 SSE data 帧
    let byte_stream = response.bytes_stream();
    let stream = byte_stream.flat_map(|chunk| {
        let text = chunk
            .map(|b| String::from_utf8_lossy(&b).to_string())
            .unwrap_or_default();
        // 按行拆分成独立的字符串事件
        futures_util::stream::iter(
            text.split_inclusive('\n')
                .map(|line| line.to_string())
                .collect::<Vec<_>>(),
        )
    });

    let sse_stream = parse_sse(stream);
    Ok(Sse::new(sse_stream).keep_alive(KeepAlive::default()))
}

/// 将上游按行拆分的文本流解析为 axum SSE Event（提取 delta.content）
fn parse_sse<S>(stream: S) -> impl futures_util::Stream<Item = Result<Event, Infallible>>
where
    S: futures_util::Stream<Item = String>,
{
    stream.filter_map(|line| async move {
        let trimmed = line.trim();
        if let Some(data) = trimmed.strip_prefix("data: ") {
            let data = data.trim();
            if data == "[DONE]" {
                return Some(Ok(Event::default().data("[DONE]")));
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = parsed
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !content.is_empty() {
                        let payload = serde_json::json!({
                            "choices": [{ "delta": { "content": content } }]
                        });
                        return Some(Ok(Event::default().data(payload.to_string())));
                    }
                }
            }
        }
        None
    })
}
