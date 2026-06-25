import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { SpecialGuestController } from './special-guest.controller';

const controller = new SpecialGuestController();
export const specialGuestRouter = new Router({ prefix: '/content-management/special-guest' });

specialGuestRouter.get('/list', jwtAuth(), hasPerm('contentManagement:specialGuest:list'), controller.list);
specialGuestRouter.get('/:id', jwtAuth(), hasPerm('contentManagement:specialGuest:list'), controller.detail);
specialGuestRouter.post('/add', jwtAuth(), hasPerm('contentManagement:specialGuest:add'), controller.add);
specialGuestRouter.put('/edit', jwtAuth(), hasPerm('contentManagement:specialGuest:edit'), controller.edit);
specialGuestRouter.put('/status', jwtAuth(), hasPerm('contentManagement:specialGuest:edit'), controller.status);
specialGuestRouter.delete('/remove', jwtAuth(), hasPerm('contentManagement:specialGuest:remove'), controller.remove);
