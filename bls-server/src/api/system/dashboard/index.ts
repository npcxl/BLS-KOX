import Router from 'koa-router';
import { Context } from 'koa';
import os from 'os';
import { getDb, queryOne, query } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';

const router = new Router({ prefix: '/system/dashboard' });

router.get('/stats', jwtAuth(), async (ctx: Context) => {
  await getDb();
  const u = ctx.state.user as any;
  const tid = u?.tenantId;

  const [userCount, roleCount, menuCount, logCount] = await Promise.all([
    queryOne<any>('SELECT COUNT(*) AS total FROM sys_user WHERE deleted = 0 AND tenant_id = :tid', { tid }),
    queryOne<any>('SELECT COUNT(*) AS total FROM sys_role WHERE deleted = 0 AND tenant_id = :tid', { tid }),
    queryOne<any>("SELECT COUNT(*) AS total FROM sys_menu WHERE status = '0'"),
    queryOne<any>('SELECT COUNT(*) AS total FROM sys_operation_log'),
  ]);

  ctx.body = {
    code: 200,
    data: {
      userCount: Number(userCount?.total ?? 0),
      roleCount: Number(roleCount?.total ?? 0),
      menuCount: Number(menuCount?.total ?? 0),
      logCount: Number(logCount?.total ?? 0),
    },
  };
});

let lastCpuUsage = process.cpuUsage();
let lastTime = Date.now();

router.get('/system-status', jwtAuth(), async (ctx: Context) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // CPU 使用率 = 两次采样间 (user + system) / (elapsed * 1000) 的百分比
  const now = Date.now();
  const elapsed = now - lastTime;
  const cpu = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastTime = now;
  const cpuPercent = elapsed > 0 ? Math.round(((cpu.user + cpu.system) / (elapsed * 1000)) * 100) : 0;

  ctx.body = {
    code: 200,
    data: {
      cpuLoad: Math.min(cpuPercent, 100),
      memUsage: Math.round((usedMem / totalMem) * 100),
      uptime: Math.floor(os.uptime()),
      nodeUptime: Math.floor(process.uptime()),
    },
  };
});

router.get('/recent-logs', jwtAuth(), async (ctx: Context) => {
  await getDb();
  const logs = await query<any>(
    'SELECT title, username, business_type AS businessType, create_time AS createTime FROM sys_operation_log ORDER BY create_time DESC LIMIT 5',
  );
  ctx.body = { code: 200, data: logs ?? [] };
});

export default router;
