/**
 * P12: Webhook 投递 Job
 */
import { createHmac } from 'crypto';
import type { JobDefinition } from '../job-types';
import { logger } from '../../core/logger';

export const webhookJob: JobDefinition = {
  type: 'webhook',
  maxAttempts: 5,
  timeout: 10_000,

  async handler(payload: Record<string, unknown>) {
    const { webhookId, url, secret, events } = payload as any;
    const payloadStr = JSON.stringify({ webhookId, events, timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', secret).update(payloadStr).digest('hex');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': webhookId,
      },
      body: payloadStr,
    });

    if (!res.ok) {
      throw new Error(`Webhook ${webhookId} returned ${res.status}: ${await res.text()}`);
    }

    logger.info('[webhook] delivered', { webhookId, status: res.status });
    return { status: res.status };
  },
};
