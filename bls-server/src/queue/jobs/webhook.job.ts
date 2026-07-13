/**
 * P12: Webhook 投递 Job
 *
 * 异步投递 Webhook，记录投递日志到 sys_webhook_delivery
 */
import { createHmac } from 'crypto';
import type { JobDefinition } from '../job-types';
import { logger } from '../../core/logger';

export const webhookJob: JobDefinition = {
  type: 'webhook',
  maxAttempts: 5,
  timeout: 10_000,

  async handler(payload: Record<string, unknown>) {
    const p = payload as any;
    const { webhookId, url, secret, events, event, attempt = 1 } = p;
    const payloadStr = JSON.stringify({
      webhookId,
      event: event ?? (Array.isArray(events) ? events[0] : 'unknown'),
      timestamp: new Date().toISOString(),
      data: p.data ?? {},
    });
    const signature = createHmac('sha256', secret).update(payloadStr).digest('hex');

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-ID': webhookId,
        },
        body: payloadStr,
      });
    } catch (err: any) {
      // 网络错误也记日志
      await logDelivery(webhookId, event ?? 'unknown', payloadStr, 'failed', null, null, String(err.message), attempt);
      throw err;
    }

    const responseBody = await res.text();
    const status = res.ok ? 'success' : 'failed';

    await logDelivery(webhookId, event ?? 'unknown', payloadStr, status, res.status, responseBody.slice(0, 500), res.ok ? null : `HTTP ${res.status}`, attempt);

    if (!res.ok) {
      throw new Error(`Webhook ${webhookId} returned ${res.status}: ${responseBody.slice(0, 200)}`);
    }

    logger.info('[webhook] delivered', { webhookId, status: res.status, elapsedMs: Date.now() - start });
    return { status: res.status };
  },
};

async function logDelivery(
  webhookId: string, event: string, payload: string,
  status: string, responseCode: number | null, responseBody: string | null,
  errorMessage: string | null, attempt: number,
) {
  try {
    const { getDb } = require('../../core/database');
    const { generateSnowflakeId } = require('../../shared/utils/snowflake');
    const db = await getDb();
    await (db as any).insertInto('sys_webhook_delivery').values({
      id: generateSnowflakeId().toString(),
      webhook_id: webhookId,
      event,
      payload,
      status,
      response_code: responseCode,
      response_body: responseBody,
      error_message: errorMessage,
      attempt,
      tenant_id: '000000',
    }).execute();
  } catch (err) {
    logger.error('[webhook] log delivery failed', { webhookId, error: String(err) });
  }
}
