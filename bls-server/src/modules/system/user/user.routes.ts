import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { UserController } from './user.controller';

const controller = new UserController();
export const userRouter = new Router({ prefix: '/system/user' });

userRouter.get('/list', jwtAuth(), hasPerm('system:user:list'), controller.list);
userRouter.post('/add', jwtAuth(), hasPerm('system:user:add'), controller.add);
userRouter.put('/edit', jwtAuth(), hasPerm('system:user:edit'), controller.edit);
userRouter.delete('/remove', jwtAuth(), hasPerm('system:user:remove'), controller.remove);
