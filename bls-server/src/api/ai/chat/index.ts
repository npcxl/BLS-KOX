import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { logger } from '../../../core/logger';

const router = new Router({ prefix: '/ai/chat' });

function getUserId(ctx: Context): string {
  const user = (ctx.state as any).user;
  return user?.userId || '';
}

function getTenantId(ctx: Context): string {
  const user = (ctx.state as any).user;
  return user?.tenantId || getCurrentTenantId() || '000000';
}

/** GET /api/ai/chat/conversations */
router.get('/conversations', jwtAuth(), async (ctx: Context) => {
  const userId = getUserId(ctx);
  if (!userId) { ctx.status = 401; ctx.body = { code: 401, message: '未登录或无法获取用户上下文' }; return; }
  try {
    const db = (await getDb()) as any;
    const rows = await db.selectFrom('ai_conversation')
      .selectAll()
      .where('user_id', '=', userId)
      .where('deleted', '=', 0)
      .orderBy('updated_at', 'desc')
      .limit(50)
      .execute();
    ctx.body = { code: 200, data: rows };
  } catch (err: any) {
    logger.error('[AI-Conversation] load error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: `数据库错误: ${err.message}` };
  }
});

/** GET /api/ai/chat/conversations/:id/messages */
router.get('/conversations/:id/messages', jwtAuth(), async (ctx: Context) => {
  const { id } = ctx.params;
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
    ctx.body = { code: 200, data: [] };
  }
});

/** POST /api/ai/chat/conversations */
router.post('/conversations', jwtAuth(), async (ctx: Context) => {
  const userId = getUserId(ctx);
  const tenantId = getTenantId(ctx);
  if (!userId) { ctx.status = 401; ctx.body = { code: 401, message: '未登录或无法获取用户上下文' }; return; }

  const body = ctx.request.body as { id?: string; title?: string; messages?: Array<{ role: string; content: string }> };
  try {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const convId = body.id || generateSnowflakeId();
    const title = body.title || '新对话';

    const existing = await db.selectFrom('ai_conversation')
      .select('id').where('id', '=', convId).executeTakeFirst();

    if (existing) {
      const updateData: any = { updated_at: now };
      if (body.title && body.title.trim()) {
        updateData.title = body.title.trim();
      }
      await db.updateTable('ai_conversation').set(updateData).where('id', '=', convId).execute();
    } else {
      await db.insertInto('ai_conversation').values({
        id: convId, user_id: userId, tenant_id: tenantId,
        title, created_at: now, updated_at: now,
      }).execute();
    }

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
    logger.error('[AI-Conversation] save error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** DELETE /api/ai/chat/conversations/:id */
router.delete('/conversations/:id', jwtAuth(), async (ctx: Context) => {
  const { id } = ctx.params;
  const userId = getUserId(ctx);
  if (!userId) { ctx.body = { code: 401 }; return; }
  try {
    const db = (await getDb()) as any;
    await db.updateTable('ai_conversation').set({ deleted: 1 }).where('id', '=', id).where('user_id', '=', userId).execute();
    ctx.body = { code: 200, message: '已删除' };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

export default router;
