import Router from "koa-router";
import { jwtAuth } from '../../../middleware/auth';
import { ExcelController } from "./excel.controller";

const controller = new ExcelController();
export const excelRouter = new Router({ prefix: "/common/excel" });

excelRouter.get("/template", jwtAuth(), controller.template);
excelRouter.post("/export", jwtAuth(), controller.export);
excelRouter.post("/import", jwtAuth(), controller.import);
