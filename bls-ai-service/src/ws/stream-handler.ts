import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getAiProvider } from '../provider/factory';
import { logger } from '../core/logger';
import { checkSqlSafety, injectTenantId } from '../api/sql/sql-guard';

interface WsMessage {
  type: 'crud' | 'sql' | 'audit' | 'config';
  token: string;
  params: Record<string, any>;
}

interface JwtPayload {
  userId: string;
  tenantId: string;
  username?: string;
  tokenType: string;
  permissions?: string[];
}

/** 消息类型 → 所需权限码 */
const PERMISSION_MAP: Record<string, string> = {
  crud: 'ai:crud:generate',
  sql: 'ai:sql:generate',
  audit: 'ai:audit:analyze',
  config: 'ai:config:review',
};

/** 输出到 WebSocket 的辅助函数 */
function send(ws: WebSocket, data: Record<string, any>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/** 验证 JWT Token */
function verifyWsToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, env.jwt.secret) as JwtPayload;
    if (payload.tokenType !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

/** 处理单个 WebSocket 连接 */
function handleConnection(ws: WebSocket, req: IncomingMessage) {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';

  let authenticated = false;
  let userId = '';
  let tenantId = '';
  let userPermissions: string[] = [];

  ws.on('message', async (raw) => {
    try {
      const msg: WsMessage = JSON.parse(raw.toString());

      // 首次消息必须携带 token 做认证
      if (!authenticated) {
        const payload = verifyWsToken(msg.token);
        if (!payload) {
          send(ws, { type: 'error', message: '认证失败，请重新登录' });
          ws.close(4001, 'Unauthorized');
          return;
        }
        authenticated = true;
        userId = payload.userId;
        tenantId = payload.tenantId;
        userPermissions = payload.permissions || [];
        logger.info('WebSocket AI 连接已认证', { userId, tenantId, clientIp });
      }

      // 权限校验（若 JWT 携带 permissions，则验证；否则降级放行）
      if (userPermissions.length > 0) {
        const requiredPerm = PERMISSION_MAP[msg.type];
        if (requiredPerm && !userPermissions.includes(requiredPerm)) {
          logger.warn('WebSocket 权限不足', { userId, type: msg.type, requiredPerm });
          send(ws, { type: 'error', message: '无操作权限' });
          ws.close(4003, 'Forbidden');
          return;
        }
      }

      // 路由到对应的 AI 处理
      switch (msg.type) {
        case 'crud':
          await handleCrudStream(ws, msg.params, tenantId);
          break;
        case 'sql':
          await handleSqlStream(ws, msg.params, tenantId);
          break;
        case 'audit':
          await handleAuditStream(ws, msg.params);
          break;
        case 'config':
          await handleConfigStream(ws, msg.params);
          break;
        default:
          send(ws, { type: 'error', message: `未知的消息类型: ${msg.type}` });
      }

      // 流式完成
      send(ws, { type: 'done' });
      ws.close(1000, 'Done');
    } catch (err: any) {
      logger.error('WebSocket 消息处理异常', { error: err.message });
      send(ws, { type: 'error', message: err.message || '处理失败' });
    }
  });

  ws.on('close', (code) => {
    logger.info('WebSocket AI 连接关闭', { userId, tenantId, code });
  });

  ws.on('error', (err) => {
    logger.error('WebSocket 连接错误', { error: err.message });
  });

  // 5 分钟超时
  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, { type: 'error', message: '请求超时' });
      ws.close(4000, 'Timeout');
    }
  }, 5 * 60 * 1000);

  ws.on('close', () => clearTimeout(timeout));
}

// ============================================================
// AI 流式处理函数
// ============================================================

async function handleCrudStream(ws: WebSocket, params: any, tenantId: string) {
  const { tableName, description } = params;

  const systemPrompt = `你是一个专业的后端开发专家。根据用户的描述生成 CRUD 配置。

返回严格的 JSON 格式（不要包含 markdown 标记），结构如下：
{"tableName":"","sql":"CREATE TABLE...","crudConfig":{"columns":[{"field":"","label":"","type":"","required":true,"searchable":true,"sortable":true}]},"menuSuggestion":{"name":"","icon":"","parentPath":""},"permissionCodes":[""],"dynamicColumns":{"list":[],"form":[],"detail":[]}}`;

  const userPrompt = `表名: ${tableName}\n描述: ${description}\n\n返回纯 JSON`;

  await streamToWs(ws, systemPrompt, userPrompt, true);
}

async function handleSqlStream(ws: WebSocket, params: any, tenantId: string) {
  const { description, tables } = params;

  const tableInfo = tables?.length > 0
    ? `\n已知表名: ${tables.join(', ')}`
    : '';

  const systemPrompt = `你是 SQL 分析专家。生成只读 SELECT 语句。不要分号。只返回 SQL。`;

  const userPrompt = `${description}${tableInfo}`;

  // 流式输出原始 SQL
  const rawContent = await streamToWsAndCollect(ws, systemPrompt, userPrompt);

  if (!rawContent) return;

  // ====== SQL Guard 安全校验 ======
  if (env.sqlGuard.enabled) {
    const guardResult = checkSqlSafety(rawContent, tenantId);
    if (!guardResult.safe) {
      logger.warn('SQL Guard 拦截 WebSocket 输出', {
        tenantId,
        reason: guardResult.reason,
        sql: rawContent.substring(0, 200),
      });
      throw new Error(`SQL 安全检查未通过: ${guardResult.reason}`);
    }

    // 注入 tenantId 隔离
    let finalSql = guardResult.sanitized || rawContent;
    if (tenantId) {
      finalSql = injectTenantId(finalSql, tenantId);
    }

    send(ws, { type: 'guard_validated', sql: finalSql, original: rawContent, tenantIsolated: !!tenantId });

    logger.info('SQL Guard 校验通过', { tenantId, sqlLength: finalSql.length });
  }
}

/** 流式输出 + 收集完整内容（用于后续校验） */
async function streamToWsAndCollect(
  ws: WebSocket,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const ai = await getAiProvider();

  if (!ai.completeStream) {
    send(ws, { type: 'start' });
    const result = await ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    send(ws, { type: 'chunk', content: result.content });
    return result.content;
  }

  send(ws, { type: 'start' });
  let full = '';
  for await (const chunk of ai.completeStream({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })) {
    full += chunk;
    send(ws, { type: 'chunk', content: chunk });
  }
  return full;
}

async function handleAuditStream(ws: WebSocket, params: any) {
  const { logType, logData } = params;

  const systemPrompt = `你是安全审计专家。分析日志，返回 JSON: {"riskLevel":"high|medium|low|none","summary":"","findings":[{"type":"","severity":"","description":"","evidence":"","recommendation":""}],"statistics":{"totalEvents":0,"uniqueIps":0,"topEventType":""}}`;

  const userPrompt = `分析以下${logType || ''}日志:\n${logData}`;

  await streamToWs(ws, systemPrompt, userPrompt, true);
}

async function handleConfigStream(ws: WebSocket, params: any) {
  const { configContent } = params;

  const systemPrompt = `你是安全配置审计专家。审查配置文件，返回 JSON: {"overallRisk":"high|medium|low|safe","summary":"","issues":[{"severity":"","category":"","title":"","location":"","current":"","risk":"","fix":""}],"bestPractices":[],"complianceScore":0}`;

  const userPrompt = `审查以下配置:\n${configContent}`;

  await streamToWs(ws, systemPrompt, userPrompt, true);
}

/** 通用流式输出 */
async function streamToWs(
  ws: WebSocket,
  systemPrompt: string,
  userPrompt: string,
  jsonMode = false,
) {
  const ai = await getAiProvider();

  if (!ai.completeStream) {
    // 降级到非流式
    send(ws, { type: 'start' });
    const result = await ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: jsonMode ? 'json_object' : 'text',
    });
    send(ws, { type: 'chunk', content: result.content });
    return;
  }

  send(ws, { type: 'start' });

  let fullContent = '';
  for await (const chunk of ai.completeStream({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: jsonMode ? 'json_object' : 'text',
  })) {
    fullContent += chunk;
    send(ws, { type: 'chunk', content: chunk });
  }

  logger.info('AI 流式输出完成', { length: fullContent.length });
}

let wssInstance: WebSocketServer | null = null;

/** 获取 WSS 实例（供 shutdown 使用） */
export function getWsServer() { return wssInstance; }

/** 挂载 WebSocket 服务器到 HTTP Server */
export function attachAiWs(httpServer: ReturnType<typeof import('http').createServer>) {
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
    if (pathname === '/ws/ai') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, req) => handleConnection(ws, req));

  logger.info('WebSocket AI 流式端点已启动: /ws/ai');

  return wss;
}
