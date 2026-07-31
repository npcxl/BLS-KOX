/**
 * OCR 文件识别 API
 * 
 * 使用 Ollama Unlimited-OCR (Q5_K_M) 多模态模型进行文件内容识别。
 * 支持：图片（png/jpg/webp等）、PDF、Office 文档等。
 * 当用户在 AI 对话中上传文件时，前端自动调用此接口先做 OCR 识别，
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

/** OCR 请求超时 */
const OCR_TIMEOUT_MS = 120_000;

/**
 * POST /api/ai/ocr/recognize
 * 
 * 接收 base64 编码的文件数据，调用 Unlimited-OCR 多模态模型进行内容识别。
 * 
 * Request Body:
 *   { image: string, filename?: string }
 * 
 * Response:
 *   { code: 0, data: { text: string }, message: string }
 */
router.post('/recognize', async (ctx: Context) => {
  const body = ctx.request.body as { image?: string; filename?: string };

  if (!body?.image) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '缺少 image 参数（base64 文件数据）' };
    return;
  }

  // 清理 base64 前缀（支持各种 data URI）
  const imageBase64 = body.image.replace(/^data:[^;]+;base64,/, '');

  const fileName = body.filename || 'unknown';
  const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName)
    || /^image\//.test(body.image);

  logger.info('[OCR] 开始识别', {
    filename: fileName,
    fileSize: imageBase64.length,
    isImage,
    model: OCR_MODEL,
  });

  const startTime = Date.now();

  // 构造 prompt：图片用 "document parsing."，其他文件类型加上更多指引
  const prompt = isImage
    ? 'document parsing.'
    : `Extract and return all text content from this document file. Include any tables, headers, and structured data.`;

  try {
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
            content: prompt,
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
      filename: fileName,
      elapsedMs: elapsed,
      textLength: text.length,
      textPreview: text.slice(0, 100),
    });

    ctx.body = {
      code: 0,
      data: { text },
      message: '识别成功',
    };
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logger.error('[OCR] 识别失败', {
      filename: fileName,
      error: err.message,
      elapsedMs: elapsed,
    });

    if (err.name === 'AbortError') {
      ctx.status = 504;
      ctx.body = { code: 504, message: '识别超时，请重试' };
    } else {
      ctx.status = 500;
      ctx.body = { code: 500, message: `识别失败: ${err.message}` };
    }
  }
});

export default router;
