import Router from 'koa-router';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { ThemeController } from './theme.controller';

const controller = new ThemeController();
export const themeRouter = new Router({ prefix: '/system/theme' });

themeRouter.get('/current', jwtAuth(), controller.current);
themeRouter.get('/list', jwtAuth(), hasPerm('system:theme:list'), controller.list);
themeRouter.post('/add', jwtAuth(), hasPerm('system:theme:edit'), controller.add);
themeRouter.put('/edit', jwtAuth(), hasPerm('system:theme:edit'), controller.edit);
themeRouter.delete('/remove', jwtAuth(), hasPerm('system:theme:edit'), controller.remove);
