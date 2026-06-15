import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { RoleController } from './role.controller';

const controller = new RoleController();
export const roleRouter = new Router({ prefix: '/system/role' });

roleRouter.get('/list', jwtAuth(), hasPerm('system:role:list'), controller.list);
roleRouter.get('/:roleId/menus', jwtAuth(), hasPerm('system:role:list'), controller.menuIds);
roleRouter.put('/:roleId/menus', jwtAuth(), hasPerm('system:role:assignMenu'), controller.assignMenus);
roleRouter.post('/add', jwtAuth(), hasPerm('system:role:add'), controller.add);
roleRouter.put('/edit', jwtAuth(), hasPerm('system:role:edit'), controller.edit);
roleRouter.delete('/remove', jwtAuth(), hasPerm('system:role:remove'), controller.remove);
