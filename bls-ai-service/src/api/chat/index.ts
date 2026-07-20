import Router from 'koa-router';
import type { Context } from 'koa';
import { success } from '../../core/response';
import { getAiProvider } from '../../provider/factory';
import type { AiMessage } from '../../provider/types';
import { logger } from '../../core/logger';

const router = new Router();

const SYSTEM_PROMPT = `You are KOX-AI, an intelligent assistant for the BLS-KOX multi-tenant SaaS platform. Help developers with:

1. **Module Builder (CRUD Generation)**: Generate complete CRUD modules following BLS-KOX conventions:
   - Table prefix: biz_ (never sys_)
   - Primary key: {module}_id (varchar 32)
   - Required system fields: tenant_id, deleted, create_by, create_time, update_by, update_time
   - Use sort_num (NOT order_num), create_time/update_time (NOT created_at/updated_at)
   - Status columns: char(1), '0'=normal, '1'=disabled
   - Deleted: tinyint, 0=active, 1=deleted
   - Permissions: biz:{module}:list|detail|add|update|remove|export|import
   - Menu type: '0'=directory, '1'=page, '2'=button
   - Page config: sys_page_config + sys_page_column_config
   - Frontend: CrudTablePage component with resource, columns, formColumns
   - Backend: defineCrudModule() factory

2. **SQL Assistant**: Read-only SELECT with tenant_id filtering

3. **Audit Analysis**: Analyze security logs

4. **Config Review**: Review .env and docker-compose files

Output code in markdown code blocks with language tags.
For module generation, output structured sections: SQL, backend code, frontend code, copy guide.
Be concise and practical.`;

/** POST /api/ai/chat/completions */
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
    // SSE stream
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
          ctx.res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
      } else {
        // Fallback: non-stream
        const result = await ai.complete({
          messages: allMessages,
          temperature: 0.3,
        });
        ctx.res.write(`data: ${JSON.stringify({ content: result.content })}\n\n`);
      }
      ctx.res.write('data: [DONE]\n\n');
    } catch (err: any) {
      logger.error('[Chat] stream error: %s', err.message);
      ctx.res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
    ctx.res.end();
  } else {
    try {
      const ai = getAiProvider();
      const result = await ai.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.3,
      });
      ctx.body = success({ content: result.content });
    } catch (err: any) {
      logger.error('[Chat] error: %s', err.message);
      ctx.status = 500;
      ctx.body = { code: 500, message: err.message };
    }
  }
});

export default router;
