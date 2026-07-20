import Router from 'koa-router';
import type { Context } from 'koa';
import { success } from '../../core/response';
import { getAiProvider } from '../../provider/factory';
import type { AiMessage } from '../../provider/types';
import { logger } from '../../core/logger';

const router = new Router();

const SYSTEM_PROMPT = `You are KOX-AI, an AI assistant for the BLS-KOX platform.

## CRITICAL: Tech Stack (NEVER use other frameworks)
- **Frontend**: React 19 + TypeScript + Ant Design Pro 6 + UmiJS Max + @ant-design/x
- **Frontend UI**: Ant Design components (antd), NOT Vue, NOT Element UI, NOT Tailwind UI
- **Backend**: Koa 3.x + TypeScript (bls-server) or Spring Boot 3 + Java 21 (bls-java-server)
- **Database**: MySQL 8.0, collation utf8mb4_0900_ai_ci
- **IMPORTANT**: When generating frontend code, use React/TSX syntax ONLY. Never generate Vue/Svelte/Angular code.

## Database Conventions
- Business tables: biz_ prefix. NEVER use sys_ prefix for new tables
- Primary key: {module}_id, type varchar(32) NOT NULL
- Required columns on every table: tenant_id varchar(32), deleted tinyint DEFAULT 0, create_by varchar(32), create_time datetime, update_by varchar(32), update_time datetime
- Column naming: sort_num (NOT order_num), create_time/update_time (NOT created_at/updated_at)
- Status: char(1), '0'=normal '1'=disabled

## Backend (Koa) Conventions
- Use defineCrudModule() factory at bls-server/src/core/crud.ts
- Config object: { table, pkField, searchFields, name, permPrefix, softDelete: true }
- Router export: export default router (auto-scanned)
- Permissions: biz:{module}:list|detail|add|update|remove|export|import

## Frontend (React) Conventions
- Use CrudTablePage component at bls-admin/src/components/CrudTablePage/
- Props: title, rowKey, resource, columns, formColumns, permissions, excelMetaKey
- resource format: { basePath: '/api/business/{module}' }
- Import: import CrudTablePage from '@/components/CrudTablePage'
- Form columns: ProFormColumnsType from @ant-design/pro-components
- Page columns: from usePageConfig('page_code') hook

## Menu SQL
- INSERT INTO sys_menu (menu_id,parent_id,menu_name,path,component,perms,icon,menu_type,sort_num,status)
- menu_type: '0'=folder '1'=page '2'=button
- Role auth: INSERT INTO sys_role_menu (role_id,menu_id) — roles: 000001 (superadmin), 100001 (tenant_admin)
- Package auth: INSERT INTO sys_package_menu (package_id,menu_id) — packages: P001 (platform), P100 (tenant)

When generating a module, output in this order:
1. CREATE TABLE SQL (with indexes)
2. Menu INSERT SQL
3. Role + Package auth SQL
4. Page config SQL
5. Backend model + router code (TypeScript, NOT Vue)
6. Frontend page + service code (React TSX, NOT Vue)
7. File locations / copy guide

Always wrap code in markdown code blocks with language tags (sql, ts, tsx).
Be concise. Do NOT explain basic concepts.`;

/** POST /api/ai/chat/completions — OpenAI-compatible SSE */
router.post('/completions', async (ctx: Context) => {
  const body = ctx.request.body as {
    messages?: Array<{ role: string; content: string }>;
    stream?: boolean;
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

  if (useStream) {
    // SSE stream — OpenAI Chat Completions compatible format
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
      const allMessages: AiMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ];

      if (ai.completeStream) {
        const stream = ai.completeStream({
          messages: allMessages,
          temperature: 0.3,
        });
        for await (const chunk of stream) {
          ctx.res.write(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: chunk } }],
            })}\n\n`,
          );
        }
      } else {
        const result = await ai.complete({
          messages: allMessages,
          temperature: 0.3,
        });
        ctx.res.write(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: result.content } }],
          })}\n\n`,
        );
      }
      ctx.res.write('data: [DONE]\n\n');
    } catch (err: any) {
      logger.error('[Chat] stream error: %s', err.message);
      ctx.res.write(
        `data: ${JSON.stringify({
          error: { message: err.message || 'AI 服务异常' },
        })}\n\n`,
      );
    }
    ctx.res.end();
  } else {
    // Non-stream
    try {
      const ai = getAiProvider();
      const result = await ai.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.3,
      });
      success(ctx, { content: result.content }, 'AI 回复成功');
    } catch (err: any) {
      logger.error('[Chat] error: %s', err.message);
      ctx.status = 500;
      ctx.body = { code: 500, message: err.message };
    }
  }
});

export default router;
