import Router from 'koa-router';
import type { Context } from 'koa';
import { success } from '../../core/response';
import { getAiProvider } from '../../provider/factory';
import type { AiMessage } from '../../provider/types';
import { logger } from '../../core/logger';
import { getDb } from '../../core/database.js';
import { getRequestContext } from '../../core/request-context.js';
import { generateSnowflakeId } from '../../shared/snowflake.js';

const router = new Router();

const SYSTEM_PROMPT = `You are KOX-AI, an AI assistant for the BLS-KOX platform.

## CRITICAL: Tech Stack (NEVER use other frameworks)
- **Frontend**: React 19 + TypeScript + Ant Design Pro 6 + UmiJS Max
- **Backend**: Koa 3.x + TypeScript (bls-server)
- **Database**: MySQL 8.0, utf8mb4_0900_ai_ci
- **IMPORTANT**: When generating frontend code, use React/TSX ONLY. Never generate Vue/Svelte/Angular.

## Database Conventions
- Business tables: biz_ prefix. NEVER use sys_ prefix for new tables
- Primary key: {module}_id, type varchar(32) NOT NULL
- Required columns: tenant_id varchar(32), deleted tinyint DEFAULT 0, create_by varchar(32), create_time datetime, update_by varchar(32), update_time datetime
- Column naming: sort_num (NOT order_num), create_time/update_time (NOT created_at/updated_at)
- Status: char(1), '0'=normal '1'=disabled

## Backend (Koa) Conventions
- defineCrudModule() at bls-server/src/core/crud.ts
- Config: { table, pkField, searchFields, name, permPrefix, softDelete: true }
- Router export: export default router
- Permissions: biz:{module}:list|detail|add|update|remove|export|import

## Frontend (React) Conventions — CRITICAL
- CrudTablePage component from @/components/CrudTablePage
- Props: title, rowKey, resource, columns, formColumns, permissions, excelMetaKey
- resource format: { basePath: '/api/business/{module}' }
- **DYNAMIC COLUMNS**: Use usePageConfig('page_code') hook to get columns, NOT hardcoded columns. Example: import { usePageConfig } from '@/hooks/usePageConfig'; const { proColumns } = usePageConfig('business_{module}');
- Form columns: ProFormColumnsType from @ant-design/pro-components
- Service: import { request } from '@umijs/max'
- The columns come from sys_page_column_config database table — NEVER hardcode them in the component

## Menu SQL
- INSERT INTO sys_menu (menu_id,parent_id,menu_name,path,component,perms,icon,menu_type,sort_num,status)
- menu_type: '0'=folder '1'=page '2'=button

## Page Config SQL — CRITICAL (frontend table columns depend on this)
sys_page_config:
  INSERT INTO sys_page_config (config_id, tenant_id, page_code, page_name, route_path, deleted) VALUES ('cfg_business_{module}','000000','business_{module}','{ModuleName}管理','/business/{module}',0);

sys_page_column_config (column_id, page_code, data_index, title, order_num, visible, searchable, editable, copyable, ellipsis, value_type, value_enum_code, placeholder, required, tenant_id, deleted):
  INSERT INTO sys_page_column_config VALUES
  ('C_001','business_{module}','{fieldName}','{中文标题}',1,1,1,0,0,0,'text',NULL,NULL,0,'000000',0),
  ('C_002','business_{module}','{fieldName}','{中文标题}',2,1,0,0,0,0,'text',NULL,NULL,0,'000000',0);
  - column_id: 'C_' + 3-digit sequential
  - data_index: camelCase (e.g. customerName, phone, followUpBy)
  - searchable: 1 for name/title/code/phone/email, 0 otherwise
  - value_type: text/select/date/digit/textarea/image

When generating a module, ALWAYS include:
1. CREATE TABLE SQL
2. Menu INSERT SQL (folder + page + 5-7 button menus)
3. Role auth SQL (000001 + 100001)
4. sys_page_config SQL
5. sys_page_column_config SQL (one row per field — THIS IS REQUIRED)
6. Backend code (model.ts + index.ts)
7. Frontend code (page.tsx + service.ts)
8. Copy guide

CRITICAL: Step 5 (page column config) is MANDATORY. The frontend uses sys_page_column_config to render dynamic table columns. Without it, pages show empty tables.

Output code in markdown code blocks with language tags (sql, ts, tsx).
Be concise.`;

/** POST /api/ai/chat/completions — SSE streaming */
router.post('/completions', async (ctx: Context) => {
  const body = ctx.request.body as {
    messages?: Array<{ role: string; content: string }>;
    stream?: boolean;
    conversationId?: string;
  };

  if (!body?.messages?.length) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '缺少 messages 参数' };
    return;
  }

  const messages: AiMessage[] = body.messages.map(m => ({
    role: (m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : 'system') as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  const useStream = body.stream !== false;

  if (!useStream) {
    try {
      const ai = getAiProvider();
      const result = await ai.complete({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.3,
      });
      success(ctx, { content: result.content }, 'AI 回复成功');
    } catch (err: any) {
      logger.error('[Chat] error: %s', err.message);
      ctx.status = 500;
      ctx.body = { code: 500, message: err.message };
    }
    return;
  }

  // SSE stream — OpenAI Chat Completions compatible
  ctx.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  ctx.status = 200;
  ctx.respond = false;
  ctx.res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const ai = getAiProvider();
    const allMessages: AiMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    if (ai.completeStream) {
      const stream = ai.completeStream({ messages: allMessages, temperature: 0.3 });
      for await (const chunk of stream) {
        ctx.res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
      }
    } else {
      const result = await ai.complete({ messages: allMessages, temperature: 0.3 });
      ctx.res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: result.content } }] })}\n\n`);
    }
    ctx.res.write('data: [DONE]\n\n');
  } catch (err: any) {
    logger.error('[Chat] stream error: %s', err.message);
    ctx.res.write(`data: ${JSON.stringify({ error: { message: err.message || 'AI 服务异常' } })}\n\n`);
  }
  ctx.res.end();
});

/** GET /api/ai/chat/conversations — 获取对话列表 */
router.get('/conversations', async (ctx: Context) => {
  const auth = getRequestContext();
  if (!auth?.userId) { ctx.body = { code: 200, data: [] }; return; }
  try {
    const db = (await getDb()) as any;
    const rows = await db.selectFrom('ai_conversation')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .where('deleted', '=', 0)
      .orderBy('updated_at', 'desc')
      .limit(50)
      .execute();
    ctx.body = { code: 200, data: rows };
  } catch (err: any) {
    logger.error('[Conversation] load error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: `数据库错误: ${err.message}` };
  }
});

/** GET /api/ai/chat/conversations/:id/messages — 获取对话消息 */
router.get('/conversations/:id/messages', async (ctx: Context) => {
  const { id } = ctx.params;
  const auth = getRequestContext();
  if (!auth?.userId) { ctx.body = { code: 200, data: [] }; return; }
  try {
    const db = (await getDb()) as any;
    const rows = await db.selectFrom('ai_conversation_message')
      .selectAll()
      .where('conversation_id', '=', id)
      .where('deleted', '=', 0)
      .orderBy('created_at', 'asc')
      .execute();
    ctx.body = { code: 200, data: rows };
  } catch (err: any) {
    logger.error('[Conversation] messages load error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: `数据库错误: ${err.message}` };
  }
});

/** POST /api/ai/chat/conversations — 创建/更新对话 */
router.post('/conversations', async (ctx: Context) => {
  const auth = getRequestContext();
  if (!auth?.userId) { ctx.body = { code: 200, data: null }; return; }
  const body = ctx.request.body as { id?: string; title?: string; messages?: Array<{ role: string; content: string }> };
  try {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    let convId = body.id || generateSnowflakeId();
    const title = body.title || '新对话';

    const existing = await db.selectFrom('ai_conversation')
      .select('id').where('id', '=', convId).executeTakeFirst();

    if (existing) {
      await db.updateTable('ai_conversation').set({ title, updated_at: now }).where('id', '=', convId).execute();
    } else {
      await db.insertInto('ai_conversation').values({
        id: convId, user_id: auth.userId, tenant_id: auth.tenantId || '000000',
        title, created_at: now, updated_at: now,
      }).execute();
    }

    // Save messages
    if (body.messages?.length) {
      for (const msg of body.messages) {
        await db.insertInto('ai_conversation_message').values({
          id: generateSnowflakeId(), conversation_id: convId,
          role: msg.role, content: msg.content, created_at: now,
        }).execute();
      }
    }

    ctx.body = { code: 200, data: { id: convId, title } };
  } catch (err: any) {
    logger.error('[Conversation] save error: %s', err.message);
    ctx.body = { code: 500, message: err.message };
  }
});

/** DELETE /api/ai/chat/conversations/:id */
router.delete('/conversations/:id', async (ctx: Context) => {
  const { id } = ctx.params;
  const auth = getRequestContext();
  if (!auth?.userId) { ctx.body = { code: 401 }; return; }
  try {
    const db = (await getDb()) as any;
    await db.updateTable('ai_conversation').set({ deleted: 1 }).where('id', '=', id).where('user_id', '=', auth.userId).execute();
    ctx.body = { code: 200, message: '已删除' };
  } catch { ctx.body = { code: 500 }; }
});

export default router;
