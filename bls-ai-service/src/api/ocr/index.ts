/**
 * OCR 图片识别 API
 * 
 * 使用 Ollama Unlimited-OCR (Q5_K_M) 模型进行图片文字识别。
 * 当用户在 AI 对话中上传图片时，前端自动调用此接口先做 OCR 识别，
 * 再将识别结果作为上下文传给 KOX-AI 对话模型。
 */

import Router from 'koa-router';
import type { Context } from 'koa';
import { logger } from '../../core/logger';
import { env } from '../../config/env';

const router = new Router();

/** Ollama Unlimited-OCR 模型名称 */
const OCR_MODEL = 'hf.co/vimalnakrani/unlimited-ocr-gguf:Q5_K_M';

/** Ollama API 地址 */
const OLLAMA_BASE_URL = env.ai.baseUrl || 'http://ollama:11434/v1';

/** OCR 请求超时（图片识别较慢，给 120 秒） */
const OCR_TIMEOUT_MS = 120_000;

/**
 * POST /api/ai/ocr/recognize
 * 
 * 接收 base64 图片数据，调用 Unlimited-OCR 模型进行文字识别。
 * 
 * Request Body:
 *   { image: string }  // base64 编码的图片数据（不含 data:xxx;base64, 前缀）
 * 
 * Response:
 *   { code: 0, data: { text: string }, message: string }
 */
router.post('/recognize', async (ctx: Context) => {
  const body = ctx.request.body as { image?: string };

  if (!body?.image) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '缺少 image 参数（base64 图片数据）' };
    return;
  }

  const imageBase64 = body.image.replace(/^data:image\/\w+;base64,/, '');

  logger.info('[OCR] 开始识别', {
    imageSize: imageBase64.length,
    model: OCR_MODEL,
  });

  const startTime = Date.now();

  try {
    // 从 Ollama base URL 提取 host，构造 /api/chat 地址
    const ollamaHost = OLLAMA_BASE_URL.replace('/v1', '').replace(/\/$/, '');
    const apiUrl = `${ollamaHost}/api/chat`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [
          {
            role: 'user',
            content: 'document parsing.',
            images: [imageBase64],
          },
        ],
        stream: false,
        options: {
          temperature: 0,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[OCR] Ollama 返回错误', {
        status: response.status,
        error: errorText,
      });
      ctx.status = 502;
      ctx.body = { code: 502, message: `OCR 模型调用失败 (${response.status})` };
      return;
    }

    const data = (await response.json()) as any;
    const text = data?.message?.content || '';

    const elapsed = Date.now() - startTime;
    logger.info('[OCR] 识别完成', {
      elapsedMs: elapsed,
      textLength: text.length,
      textPreview: text.slice(0, 100),
    });

    ctx.body = {
      code: 0,
      data: { text },
      message: 'OCR 识别成功',
    };
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logger.error('[OCR] 识别失败', {
      error: err.message,
      elapsedMs: elapsed,
    });

    if (err.name === 'AbortError') {
      ctx.status = 504;
      ctx.body = { code: 504, message: 'OCR 识别超时，请重试' };
    } else {
      ctx.status = 500;
      ctx.body = { code: 500, message: `OCR 识别失败: ${err.message}` };
    }
  }
});

export default router;
