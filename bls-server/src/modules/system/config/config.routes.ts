import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { ConfigController } from './config.controller';

const controller = new ConfigController();
export const configRouter = new Router({ prefix: '/system/config' });

configRouter.get('/list', jwtAuth(), hasPerm('system:config:list'), controller.list);
configRouter.get('/:configId', jwtAuth(), hasPerm('system:config:list'), controller.detail);
configRouter.post('/add', jwtAuth(), hasPerm('system:config:add'), controller.add);
configRouter.put('/edit', jwtAuth(), hasPerm('system:config:edit'), controller.edit);
