import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { MeetingController } from './meeting.controller';

const controller = new MeetingController();
export const meetingRouter = new Router({ prefix: '/content-management/meeting' });

meetingRouter.get('/list', jwtAuth(), hasPerm('contentManagement:meeting:list'), controller.list);
meetingRouter.get('/:id', jwtAuth(), hasPerm('contentManagement:meeting:list'), controller.detail);
meetingRouter.post('/add', jwtAuth(), hasPerm('contentManagement:meeting:add'), controller.add);
meetingRouter.put('/edit', jwtAuth(), hasPerm('contentManagement:meeting:edit'), controller.edit);
meetingRouter.put('/status', jwtAuth(), hasPerm('contentManagement:meeting:edit'), controller.status);
meetingRouter.delete('/remove', jwtAuth(), hasPerm('contentManagement:meeting:remove'), controller.remove);
