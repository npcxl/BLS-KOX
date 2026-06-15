import Router from 'koa-router';
import { jwtAuth } from '../../middleware/auth';
import { AuthController } from './auth.controller';

const controller = new AuthController();
export const authRouter = new Router({ prefix: '/auth' });

authRouter.post('/login', controller.login);
authRouter.post('/refresh', controller.refresh);
authRouter.get('/profile', jwtAuth(), controller.profile);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', jwtAuth({ optional: true }), controller.logout);
