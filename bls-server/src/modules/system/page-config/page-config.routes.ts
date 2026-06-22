import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { PageConfigController } from './page-config.controller';

const controller = new PageConfigController();
export const pageConfigRouter = new Router({ prefix: '/system/page-config' });

pageConfigRouter.get('/list', jwtAuth(), hasPerm('system:page-config:list'), controller.list);
pageConfigRouter.get('/page/:pageCode', jwtAuth(), hasPerm('system:page-config:list'), controller.detail);
pageConfigRouter.get('/page/:pageCode/columns', jwtAuth(), hasPerm('system:page-config:list'), controller.columns);
pageConfigRouter.post('/save', jwtAuth(), hasPerm('system:page-config:edit'), controller.save);
