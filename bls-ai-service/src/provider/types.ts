/**
 * AI Provider 抽象接口
 * 支持替换不同的大模型提供商（OpenAI / DeepSeek / 通义千问 等）
 * 新增 provider 只需实现此接口并在 factory 中注册
 */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
}

export interface AiCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiProvider {
  /** Provider 名称 */
  readonly name: string;

  /** 完成对话 */
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;

  /** 流式完成对话（可选实现） */
  completeStream?(request: AiCompletionRequest): AsyncIterable<string>;
}
