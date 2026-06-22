import Router from 'koa-router';
import { jwtAuth } from '../../middleware/auth';
import { hasPerm } from '../../middleware/permission';
import { BusinessController } from './business.controller';

export const businessRouter = new Router({ prefix: '/business' });
const controller = new BusinessController();

businessRouter.get('/production-lines/list', jwtAuth(), hasPerm('business:production-line:list'), controller.productionLineList);
businessRouter.get('/production-lines/:id', jwtAuth(), hasPerm('business:production-line:list'), controller.productionLineDetail);
businessRouter.post('/production-lines/add', jwtAuth(), hasPerm('business:production-line:add'), controller.productionLineAdd);
businessRouter.put('/production-lines/edit', jwtAuth(), hasPerm('business:production-line:edit'), controller.productionLineEdit);
businessRouter.delete('/production-lines/remove', jwtAuth(), hasPerm('business:production-line:remove'), controller.productionLineRemove);

businessRouter.get('/products/list', jwtAuth(), hasPerm('business:product:list'), controller.productList);
businessRouter.get('/products/:id', jwtAuth(), hasPerm('business:product:list'), controller.productDetail);
businessRouter.post('/products/add', jwtAuth(), hasPerm('business:product:add'), controller.productAdd);
businessRouter.put('/products/edit', jwtAuth(), hasPerm('business:product:edit'), controller.productEdit);
businessRouter.delete('/products/remove', jwtAuth(), hasPerm('business:product:remove'), controller.productRemove);

businessRouter.get('/orders/list', jwtAuth(), hasPerm('business:order:list'), controller.orderList);
businessRouter.get('/orders/:id', jwtAuth(), hasPerm('business:order:list'), controller.orderDetail);
businessRouter.post('/orders/add', jwtAuth(), hasPerm('business:order:add'), controller.orderAdd);
businessRouter.put('/orders/edit', jwtAuth(), hasPerm('business:order:edit'), controller.orderEdit);
businessRouter.delete('/orders/remove', jwtAuth(), hasPerm('business:order:remove'), controller.orderRemove);

businessRouter.get('/finance-records/list', jwtAuth(), hasPerm('business:finance-record:list'), controller.financeList);
businessRouter.get('/finance-records/:id', jwtAuth(), hasPerm('business:finance-record:list'), controller.financeDetail);
businessRouter.post('/finance-records/add', jwtAuth(), hasPerm('business:finance-record:add'), controller.financeAdd);
businessRouter.put('/finance-records/edit', jwtAuth(), hasPerm('business:finance-record:edit'), controller.financeEdit);
businessRouter.delete('/finance-records/remove', jwtAuth(), hasPerm('business:finance-record:remove'), controller.financeRemove);

businessRouter.get('/sales-records/list', jwtAuth(), hasPerm('business:sales-record:list'), controller.salesList);
businessRouter.get('/sales-records/:id', jwtAuth(), hasPerm('business:sales-record:list'), controller.salesDetail);
businessRouter.post('/sales-records/add', jwtAuth(), hasPerm('business:sales-record:add'), controller.salesAdd);
businessRouter.put('/sales-records/edit', jwtAuth(), hasPerm('business:sales-record:edit'), controller.salesEdit);
businessRouter.delete('/sales-records/remove', jwtAuth(), hasPerm('business:sales-record:remove'), controller.salesRemove);

businessRouter.get('/inventories/list', jwtAuth(), hasPerm('business:inventory:list'), controller.inventoryList);
businessRouter.get('/inventories/:id', jwtAuth(), hasPerm('business:inventory:list'), controller.inventoryDetail);
businessRouter.post('/inventories/add', jwtAuth(), hasPerm('business:inventory:add'), controller.inventoryAdd);
businessRouter.put('/inventories/edit', jwtAuth(), hasPerm('business:inventory:edit'), controller.inventoryEdit);
businessRouter.delete('/inventories/remove', jwtAuth(), hasPerm('business:inventory:remove'), controller.inventoryRemove);
