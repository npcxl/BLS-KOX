import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { MenuController } from './menu.controller';

const controller = new MenuController();
export const menuRouter = new Router({ prefix: '/system/menu' });

menuRouter.get('/list', jwtAuth(), hasPerm('system:menu:list'), controller.list);
menuRouter.get('/package-tree', jwtAuth(), controller.packageTree);
menuRouter.post('/add', jwtAuth(), hasPerm('system:menu:add'), controller.add);
menuRouter.put('/edit', jwtAuth(), hasPerm('system:menu:edit'), controller.edit);
menuRouter.delete('/remove', jwtAuth(), hasPerm('system:menu:edit'), controller.remove);
