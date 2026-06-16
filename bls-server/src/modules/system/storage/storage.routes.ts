import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { StorageController } from './storage.controller';

const controller = new StorageController();
export const storageRouter = new Router({ prefix: '/system/storage' });

storageRouter.get('/list', jwtAuth(), hasPerm('system:storage:list'), controller.list);
storageRouter.get('/files', jwtAuth(), hasPerm('system:file:list'), controller.listFiles);
storageRouter.get('/default', jwtAuth(), controller.defaultStorage);
storageRouter.get('/:storageId', jwtAuth(), hasPerm('system:storage:list'), controller.detail);
storageRouter.post('/add', jwtAuth(), hasPerm('system:storage:add'), controller.add);
storageRouter.put('/edit', jwtAuth(), hasPerm('system:storage:edit'), controller.edit);
storageRouter.post('/upload', jwtAuth(), hasPerm('system:file:upload'), controller.upload);
storageRouter.get('/files/:fileId/url', jwtAuth(), hasPerm('system:file:download'), controller.fileUrl);
storageRouter.get('/files/:fileId/download', jwtAuth(), hasPerm('system:file:download'), controller.downloadFile);
storageRouter.delete('/files/:fileId', jwtAuth(), hasPerm('system:file:remove'), controller.removeFile);
