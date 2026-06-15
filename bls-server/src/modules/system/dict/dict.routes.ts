import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { DictController } from './dict.controller';

const controller = new DictController();
export const dictRouter = new Router({ prefix: '/system/dict' });

dictRouter.get('/type/list', jwtAuth(), hasPerm('system:dict:list'), controller.listTypes);
dictRouter.post('/type/add', jwtAuth(), hasPerm('system:dict:add'), controller.addType);
dictRouter.put('/type/edit', jwtAuth(), hasPerm('system:dict:edit'), controller.editType);
dictRouter.delete('/type/remove', jwtAuth(), hasPerm('system:dict:remove'), controller.removeTypes);

dictRouter.get('/data/list', jwtAuth(), hasPerm('system:dict:list'), controller.listData);
dictRouter.get('/data/type', jwtAuth(), controller.listDataByType);
dictRouter.post('/data/add', jwtAuth(), hasPerm('system:dict:add'), controller.addData);
dictRouter.put('/data/edit', jwtAuth(), hasPerm('system:dict:edit'), controller.editData);
dictRouter.delete('/data/remove', jwtAuth(), hasPerm('system:dict:remove'), controller.removeData);
