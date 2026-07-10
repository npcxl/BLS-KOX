import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/log' });

const T = 'sys_security_log';

router.get('/security', jwtAuth(), hasPerm('system:log:security:list'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum || 1);
  const s = Math.min(100, +q.pageSize || 10);

  let b = db.selectFrom(T).selectAll();

  if (q.eventType) b = b.where('event_type', '=', q.eventType);
  if (q.riskLevel) b = b.where('risk_level', '=', q.riskLevel);
  if (q.username) b = b.where('username', 'like', `%${q.username}%`);
  if (q.clientIp) b = b.where('client_ip', 'like', `%${q.clientIp}%`);
  if (q.keyword) {
    b = b.where((eb: any) => eb.or([
      eb('title', 'like', `%${q.keyword}%`),
      eb('username', 'like', `%${q.keyword}%`),
      eb('route', 'like', `%${q.keyword}%`),
    ]));
  }

  const cr = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = {
    code: 200,
    data: await b.orderBy('create_time', 'desc').limit(s).offset((p - 1) * s).execute(),
    total: Number(cr?.total ?? 0),
  };
});

export default router;
