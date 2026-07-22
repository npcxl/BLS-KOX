import { AiProvider } from './types';
import { OpenAIProvider } from './openai';
import { env } from '../config/env';
import { logger } from '../core/logger';

// ========== 模型配置缓存 ==========
export interface ModelConfig {
  configId: string;
  modelName: string;
  modelType: 'api' | 'local';
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  isDefault: string;
  status: string;
}
let modelConfigCache: ModelConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30秒缓存

/** 从 bls-server 的 API 获取模型配置（失败则降级环境变量） */
async function fetchModelConfigs(): Promise<ModelConfig[]> {
  try {
    const serverUrl = env.blsServerUrl || 'http://bls-server:7001';
    const res = await fetch(`${serverUrl}/api/system/ai-model/list`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.internalSecret,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    return (json.data || []) as ModelConfig[];
  } catch (err: any) {
    logger.warn('[ModelConfig] 无法获取模型配置，降级环境变量', { error: err.message });
    return [];
  }
}

export async function getModelConfigs(): Promise<ModelConfig[]> {
  
  if (modelConfigCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return modelConfigCache;
  }

  const configs = await fetchModelConfigs();
  if (configs.length > 0) {
    modelConfigCache = configs;
    cacheTimestamp = Date.now();
  }
  return configs;
}

/** 根据 modelId 查找模型配置 */
async function findModelConfig(modelId?: string): Promise<ModelConfig | null> {
  const configs = await getModelConfigs();
  if (configs.length === 0) return null;

  if (modelId) {
    const match = configs.find(c => c.modelId === modelId && c.status === '0');
    if (match) return match;
  }
  // 找默认的
  return configs.find(c => c.isDefault === '1' && c.status === '0')
    || configs.find(c => c.status === '0')
    || configs[0];
}

// ========== Provider 创建 ==========
function createProvider(config: { apiKey: string; model: string; baseUrl: string; timeoutMs: number; temperature: number }): AiProvider {
  return new OpenAIProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    temperature: config.temperature,
  });
}

let defaultProvider: AiProvider | null = null;

/** 获取默认 Provider（优先模型配置表，fallback 环境变量） */
export async function getAiProvider(): Promise<AiProvider> {
  if (defaultProvider) return defaultProvider;

  const cfg = await findModelConfig();
  if (cfg) {
    defaultProvider = createProvider({
      apiKey: cfg.apiKey || env.ai.apiKey,
      model: cfg.modelId,
      baseUrl: cfg.baseUrl || getDefaultBaseUrl(cfg.provider),
      timeoutMs: cfg.timeoutMs || env.ai.timeoutMs,
      temperature: cfg.temperature ?? env.ai.temperature,
    });
    logger.info(`[Provider] 使用模型配置表: ${cfg.modelName} (${cfg.modelId})`);
  } else {
    defaultProvider = createProvider({
      apiKey: env.ai.apiKey,
      model: env.ai.model,
      baseUrl: env.ai.baseUrl || getDefaultBaseUrl(env.ai.provider),
      timeoutMs: env.ai.timeoutMs,
      temperature: env.ai.temperature,
    });
    logger.info(`[Provider] 使用环境变量: ${env.ai.provider}/${env.ai.model}`);
  }
  return defaultProvider;
}

/** 使用指定模型创建 Provider（每次新建，不使用缓存） */
export async function getAiProviderForModel(modelId: string): Promise<AiProvider> {
  const cfg = await findModelConfig(modelId);
  if (cfg) {
    logger.info(`[Provider] 动态模型: ${cfg.modelName} (${cfg.modelId})`);
    return createProvider({
      apiKey: cfg.apiKey || env.ai.apiKey,
      model: cfg.modelId,
      baseUrl: cfg.baseUrl || getDefaultBaseUrl(cfg.provider),
      timeoutMs: cfg.timeoutMs || env.ai.timeoutMs,
      temperature: cfg.temperature ?? env.ai.temperature,
    });
  }
  // fallback 环境变量
  return createProvider({
    apiKey: env.ai.apiKey,
    model: modelId,
    baseUrl: env.ai.baseUrl || getDefaultBaseUrl(env.ai.provider),
    timeoutMs: env.ai.timeoutMs,
    temperature: env.ai.temperature,
  });
}

/** 清除缓存（模型配置修改后调用） */
export function clearModelConfigCache() {
  modelConfigCache = null;
  cacheTimestamp = 0;
  defaultProvider = null;
}

function getDefaultBaseUrl(providerName: string): string {
  switch (providerName) {
    case 'deepseek': return 'https://api.deepseek.com/v1';
    case 'qwen': return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    case 'ollama': return 'http://ollama:11434';
    default: return 'https://api.openai.com/v1';
  }
}

/** 构建 AI 请求的便捷方法 */
export async function askAI(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  const ai = await getAiProvider();
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
