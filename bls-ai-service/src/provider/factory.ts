import { AiProvider } from './types';
import { OpenAIProvider } from './openai';
import { env } from '../config/env';

let provider: AiProvider | null = null;

function createProvider(model: string): AiProvider {
  return new OpenAIProvider({
    apiKey: env.ai.apiKey,
    model,
    baseUrl: env.ai.baseUrl || getDefaultBaseUrl(env.ai.provider),
    timeoutMs: env.ai.timeoutMs,
    temperature: env.ai.temperature,
  });
}

/**
 * AI Provider 工厂
 * 根据 AI_PROVIDER 环境变量创建对应的 Provider 实例
 * 新增 Provider：
 *   1. 实现 AiProvider 接口
 *   2. 在此 register 一个分支
 */
export function getAiProvider(): AiProvider {
  if (provider) return provider;
  provider = createProvider(env.ai.model);
  return provider;
}

/**
 * 使用指定模型创建 Provider（每次新建，不使用缓存）
 * 用于前端动态切换模型
 */
export function getAiProviderForModel(model: string): AiProvider {
  return createProvider(model);
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
