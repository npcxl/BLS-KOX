import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { PageConfigController } from './page-config.controller';

const controller = new PageConfigController();
export const pageConfigRouter = new Router({ prefix: '/system/page-config' });

pageConfigRouter.get('/list', jwtAuth(), hasPerm('system:pageConfig:list'), controller.list);
pageConfigRouter.get('/:pageCode', jwtAuth(), hasPerm('system:pageConfig:list'), controller.detail);
