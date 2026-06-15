import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { PackageController } from './package.controller';

const controller = new PackageController();
export const packageRouter = new Router({ prefix: '/system/package' });

packageRouter.get('/list', jwtAuth(), hasPerm('system:package:list'), controller.list);
packageRouter.get('/options', jwtAuth(), controller.options);
packageRouter.get('/:packageId', jwtAuth(), hasPerm('system:package:list'), controller.detail);
packageRouter.post('/add', jwtAuth(), hasPerm('system:package:add'), controller.add);
packageRouter.put('/edit', jwtAuth(), hasPerm('system:package:edit'), controller.edit);
packageRouter.delete('/remove', jwtAuth(), hasPerm('system:package:remove'), controller.remove);
packageRouter.get('/:packageId/menus', jwtAuth(), hasPerm('system:package:list'), controller.menuIds);
packageRouter.put('/:packageId/menus', jwtAuth(), hasPerm('system:package:assignMenu'), controller.assignMenus);
