/**
 * 发布中心 WebSocket 推送
 *
 * 频道: ops:release:{taskId}
 * 每个客户端连接时声明订阅的频道，推送时按频道精确匹配
 */
import { logger } from '../../../../core/logger';
import type { ReleaseProgressMessage } from './release.types';

interface WsClient {
  readyState: number;
  channels: Set<string>;
  send(data: string): void;
}

/** 获取 WebSocket Server 实例 */
function getWsServer(): any {
  try {
    const { getWsServer } = require('../../../system/realtime/realtime.ws');
    return getWsServer();
  } catch {
    return null;
  }
}

/** 向特定频道推送（按频道精确匹配） */
export function sendToChannel(taskId: string, data: ReleaseProgressMessage): void {
  try {
    const wss = getWsServer();
    if (!wss) return;

    const channel = `ops:release:${taskId}`;
    const payload = JSON.stringify({ channel, ...data });

    wss.clients.forEach((client: WsClient) => {
      if (client.readyState !== 1) return; // WebSocket.OPEN
      // 按频道精确推送：客户端需订阅对应频道
      if (!client.channels || client.channels.has(channel) || client.channels.has('ops:release:*')) {
        try { client.send(payload); } catch { /* ignore send errors */ }
      }
    });
  } catch (err: any) {
    logger.warn('[ReleaseWS] 频道推送失败: %s', err.message);
  }
}

/** 广播给所有连接 */
export function broadcastReleaseProgress(msg: ReleaseProgressMessage): void {
  try {
    const wss = getWsServer();
    if (!wss) return;

    const payload = JSON.stringify(msg);
    wss.clients.forEach((client: WsClient) => {
      if (client.readyState === 1) {
        try { client.send(payload); } catch { /* ignore */ }
      }
    });
  } catch (err: any) {
    logger.warn('[ReleaseWS] 广播失败: %s', err.message);
  }
}

/** 订阅频道（客户端连接时调用） */
export function subscribeChannel(client: WsClient, channel: string): void {
  if (!client.channels) client.channels = new Set();
  client.channels.add(channel);
}

/** 取消订阅频道 */
export function unsubscribeChannel(client: WsClient, channel: string): void {
  client.channels?.delete(channel);
}
