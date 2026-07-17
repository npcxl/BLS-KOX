import Router from 'koa-router';
import type { Context } from 'koa';
import { eventsArraySchema, queryEventsSchema } from '../schemas/event.schema';
import { writeEvents, queryEvents } from '../services/event.service';

const router = new Router();

// ====== 批量接收事件 ======
router.post('/events', async (ctx: Context) => {
  const parsed = eventsArraySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      code: 400,
      message: 'Validation failed',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
    return;
  }

  const { success, failed } = await writeEvents(parsed.data.events);
  ctx.body = {
    code: 200,
    message: `Received ${parsed.data.events.length} events`,
    data: { success, failed },
  };
});

// ====== 查询事件列表 ======
router.get('/events', async (ctx: Context) => {
  const parsed = queryEventsSchema.safeParse(ctx.query);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      code: 400,
      message: 'Validation failed',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
    return;
  }

  const result = await queryEvents(parsed.data);
  ctx.body = { code: 200, data: result, message: 'ok' };
});

export default router;
