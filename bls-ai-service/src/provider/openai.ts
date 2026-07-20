import { AiMessage, AiCompletionRequest, AiCompletionResponse, AiProvider } from './types';
import { AIProviderError } from '../core/errors';
import { logger } from '../core/logger';

interface OpenAiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  temperature: number;
}

export class OpenAIProvider implements AiProvider {
  readonly name = 'openai';

  private config: OpenAiConfig;

  constructor(config: OpenAiConfig) {
    this.config = config;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const url = `${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
    const temperature = request.temperature ?? this.config.temperature;

    const body: any = {
      model: this.config.model,
      messages: request.messages,
      temperature,
      max_tokens: request.maxTokens ?? 4096,
    };

    // JSON 模式要求 system message 中包含 "json" 关键字
    if (request.responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      logger.info('AI 请求发送', {
        provider: this.name,
        model: this.config.model,
        messageCount: request.messages.length,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('AI API 返回错误', {
          status: response.status,
          error: errorText,
        });
        throw new AIProviderError(`AI 服务返回错误 (${response.status})`);
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? '';

      logger.info('AI 请求完成', {
        model: data.model,
        usage: data.usage,
      });

      return {
        content,
        model: data.model ?? this.config.model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: any) {
      if (error instanceof AIProviderError) throw error;
      if (error.name === 'AbortError') {
        throw new AIProviderError('AI 服务请求超时');
      }
      logger.error('AI 请求异常', { error: error.message });
      throw new AIProviderError('AI 服务请求失败');
    } finally {
      clearTimeout(timeout);
    }
  }

  async *completeStream(request: AiCompletionRequest): AsyncIterable<string> {
    const url = `${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
    const temperature = request.temperature ?? this.config.temperature;

    const body = {
      model: this.config.model,
      messages: request.messages,
      temperature,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AIProviderError(`AI 服务返回错误 (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new AIProviderError('无法读取流式响应');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { yield content; await new Promise(r => setTimeout(r, 15)); }
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
