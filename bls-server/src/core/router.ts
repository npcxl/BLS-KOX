import Router from 'koa-router';
import { authRouter } from '../modules/auth/auth.routes';
import { deptRouter } from '../modules/system/dept/dept.routes';
import { menuRouter } from '../modules/system/menu/menu.routes';
import { packageRouter } from '../modules/system/package/package.routes';
import { roleRouter } from '../modules/system/role/role.routes';
import { configRouter } from '../modules/system/config/config.routes';
import { dictRouter } from '../modules/system/dict/dict.routes';
import { tenantRouter } from '../modules/system/tenant/tenant.routes';
import { themeRouter } from '../modules/system/theme/theme.routes';
import { userRouter } from '../modules/system/user/user.routes';
import { pageConfigRouter } from '../modules/system/page-config/page-config.routes';

export function createRouter(): Router {
  const router = new Router({ prefix: '/api' });
  router.get('/health', (ctx) => {
    ctx.body = { code: 200, message: 'ok' };
  });
  router.use(authRouter.routes(), authRouter.allowedMethods());
  router.use(tenantRouter.routes(), tenantRouter.allowedMethods());
  router.use(packageRouter.routes(), packageRouter.allowedMethods());
  router.use(configRouter.routes(), configRouter.allowedMethods());
  router.use(dictRouter.routes(), dictRouter.allowedMethods());
  router.use(themeRouter.routes(), themeRouter.allowedMethods());
  router.use(deptRouter.routes(), deptRouter.allowedMethods());
  router.use(userRouter.routes(), userRouter.allowedMethods());
  router.use(roleRouter.routes(), roleRouter.allowedMethods());
  router.use(menuRouter.routes(), menuRouter.allowedMethods());
  router.use(pageConfigRouter.routes(), pageConfigRouter.allowedMethods());
  return router;
}
