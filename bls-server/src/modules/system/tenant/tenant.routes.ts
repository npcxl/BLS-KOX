import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { TenantController } from './tenant.controller';

const controller = new TenantController();
export const tenantRouter = new Router({ prefix: '/system/tenant' });

tenantRouter.get('/public-list', controller.publicList);
tenantRouter.get('/list', jwtAuth(), hasPerm('system:tenant:list'), controller.list);
tenantRouter.post('/add', jwtAuth(), hasPerm('system:tenant:add'), controller.add);
tenantRouter.put('/edit', jwtAuth(), hasPerm('system:tenant:edit'), controller.edit);
tenantRouter.delete('/remove', jwtAuth(), hasPerm('system:tenant:remove'), controller.remove);
tenantRouter.put('/status', jwtAuth(), hasPerm('system:tenant:edit'), controller.status);
