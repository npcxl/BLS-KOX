import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { NewsController } from './news.controller';

const controller = new NewsController();
export const newsRouter = new Router({ prefix: '/content-management/news' });

newsRouter.get('/list', jwtAuth(), hasPerm('contentManagement:news:list'), controller.list);
newsRouter.get('/:id', jwtAuth(), hasPerm('contentManagement:news:list'), controller.detail);
newsRouter.post('/add', jwtAuth(), hasPerm('contentManagement:news:add'), controller.add);
newsRouter.put('/edit', jwtAuth(), hasPerm('contentManagement:news:edit'), controller.edit);
newsRouter.delete('/remove', jwtAuth(), hasPerm('contentManagement:news:remove'), controller.remove);
