import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { DownloadController } from './download.controller';

const controller = new DownloadController();
export const downloadRouter = new Router({ prefix: '/content-management/download' });

downloadRouter.get('/list', jwtAuth(), hasPerm('contentManagement:download:list'), controller.list);
downloadRouter.get('/:id', jwtAuth(), hasPerm('contentManagement:download:list'), controller.detail);
downloadRouter.post('/add', jwtAuth(), hasPerm('contentManagement:download:add'), controller.add);
downloadRouter.put('/edit', jwtAuth(), hasPerm('contentManagement:download:edit'), controller.edit);
downloadRouter.delete('/remove', jwtAuth(), hasPerm('contentManagement:download:remove'), controller.remove);
