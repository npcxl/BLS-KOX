import Router from "koa-router";
import { getSystemRealtimeInfo } from "./realtime.service";

export const realtimeRouter = new Router({ prefix: "/system/realtime" });

realtimeRouter.get("/info", (ctx) => {
  ctx.body = { code: 200, data: getSystemRealtimeInfo() };
});
