import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { DeptController } from './dept.controller';

const controller = new DeptController();
export const deptRouter = new Router({ prefix: '/system/dept' });

deptRouter.get('/list', jwtAuth(), hasPerm('system:dept:list'), controller.list);
deptRouter.post('/add', jwtAuth(), hasPerm('system:dept:add'), controller.add);
deptRouter.put('/edit', jwtAuth(), hasPerm('system:dept:edit'), controller.edit);
deptRouter.delete('/remove', jwtAuth(), hasPerm('system:dept:remove'), controller.remove);
