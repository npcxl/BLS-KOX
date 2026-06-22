import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { GlobalSearchController } from './global-search.controller';

const controller = new GlobalSearchController();
export const globalSearchRouter = new Router({ prefix: '/global-search' });
export const globalSearchConfigRouter = new Router({ prefix: '/system/global-search-config' });
export const searchIndexRouter = new Router({ prefix: '/system/search-index' });

globalSearchRouter.get('/', jwtAuth(), hasPerm('system:global-search:list'), controller.search);

globalSearchConfigRouter.get('/list', jwtAuth(), hasPerm('system:global-search-config:list'), controller.listConfigs);
globalSearchConfigRouter.post('/create', jwtAuth(), hasPerm('system:global-search-config:create'), controller.saveConfig);
globalSearchConfigRouter.put('/update', jwtAuth(), hasPerm('system:global-search-config:update'), controller.saveConfig);
globalSearchConfigRouter.delete('/delete/:searchId', jwtAuth(), hasPerm('system:global-search-config:delete'), controller.deleteConfig);
searchIndexRouter.post('/rebuild', jwtAuth(), hasPerm('system:search-index:rebuild'), controller.rebuild);
