import { AiProvider } from './types';
import { OpenAIProvider } from './openai';
import { env } from '../config/env';

let provider: AiProvider | null = null;

/**
 * AI Provider 工厂
 * 根据 AI_PROVIDER 环境变量创建对应的 Provider 实例
 * 新增 Provider：
 *   1. 实现 AiProvider 接口
 *   2. 在此 register 一个分支
 */
export function getAiProvider(): AiProvider {
  if (provider) return provider;

  switch (env.ai.provider) {
    case 'openai':
    case 'deepseek':
    case 'qwen':
    case 'custom':
    default:
      // 所有兼容 OpenAI API 格式的 provider 都复用 OpenAIProvider
      // 通过 AI_BASE_URL 区分不同服务端点
      provider = new OpenAIProvider({
        apiKey: env.ai.apiKey,
        model: env.ai.model,
        baseUrl: env.ai.baseUrl || getDefaultBaseUrl(env.ai.provider),
        timeoutMs: env.ai.timeoutMs,
        temperature: env.ai.temperature,
      });
      break;
  }

  return provider;
}

function getDefaultBaseUrl(providerName: string): string {
  switch (providerName) {
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'qwen':
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

/** 构建 AI 请求的便捷方法 */
export async function askAI(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  const ai = getAiProvider();
  const result = await ai.complete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    responseFormat: options?.jsonMode ? 'json_object' : 'text',
  });
  return result.content;
}
