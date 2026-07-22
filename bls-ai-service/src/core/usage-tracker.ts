import { env } from '../config/env';
import { logger } from './logger';

/** 模型单价 (USD / 1K tokens)，用于费用估算 */
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'qwen2.5:7b':          { prompt: 0, completion: 0 },           // 本地 Ollama 免费
  'qwen2.5-coder:7b':    { prompt: 0, completion: 0 },
  'deepseek-coder-v2:16b': { prompt: 0, completion: 0 },
  'llama3.1:8b':         { prompt: 0, completion: 0 },
  'deepseek-chat':       { prompt: 0.00014, completion: 0.00028 },  // DeepSeek V2
  'deepseek-coder':      { prompt: 0.00014, completion: 0.00028 },
  'gpt-4o-mini':         { prompt: 0.00015, completion: 0.0006 },   // OpenAI
  'gpt-4o':              { prompt: 0.0025, completion: 0.01 },
  'gpt-3.5-turbo':       { prompt: 0.0005, completion: 0.0015 },
  'qwen-turbo':          { prompt: 0.0003, completion: 0.0006 },    // 通义千问
  'qwen-plus':           { prompt: 0.0008, completion: 0.002 },
  'qwen-max':            { prompt: 0.002, completion: 0.006 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const key = model.toLowerCase();
  const pricing = MODEL_PRICING[key];
  if (!pricing || (pricing.prompt === 0 && pricing.completion === 0)) return 0;
  return Number(((promptTokens / 1000) * pricing.prompt + (completionTokens / 1000) * pricing.completion).toFixed(6));
}

export interface UsageRecord {
  tenantId?: string;
  userId?: string;
  username?: string;
  modelName: string;
  provider: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  elapsedMs: number;
  success: boolean;
  errorMsg?: string;
  streamMode: boolean;
}

/**
 * 异步上报 AI 用量到 bls-server（不阻塞主流程）
 */
export function trackUsage(record: UsageRecord): void {
  const serverUrl = env.blsServerUrl || 'http://bls-server:7001';
  const url = `${serverUrl}/api/system/ai-usage/report`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.internalSecret,
    },
    body: JSON.stringify({
      ...record,
      estimatedCost: estimateCost(record.modelName, record.promptTokens, record.completionTokens),
    }),
  })
    .then((res) => {
      if (!res.ok) logger.warn('[UsageTracker] report failed HTTP %d', res.status);
    })
    .catch((err) => {
      logger.warn('[UsageTracker] report error: %s', err.message);
    });
}
