import Router from 'koa-router';
import { LogController } from './log.controller';

const router = new Router({ prefix: '/system/log' });
const controller = new LogController();

router.get('/login', controller.login);
router.get('/operation', controller.operation);
router.get('/upload', controller.upload);

export default router;
