import Router from "koa-router";
import { readdirSync, existsSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { jwtAuth } from "../middleware/auth";
import type { Context } from "koa";
import { collectMetrics } from "../observability/metrics";

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

function inferMethod(name: string): "get" | "post" | "put" | "delete" {
  const lower = name.toLowerCase();
  if (lower === "login" || lower === "logout" || lower === "refresh" || lower.startsWith("add") || lower.startsWith("create") || lower.startsWith("save")) return "post";
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "delete";
  if (lower.startsWith("edit") || lower.startsWith("update")) return "put";
  return "get";
}

function isIgnoredFile(name: string): boolean {
  if (name === "model.ts" || name === "model.js") return true;
  if (name.endsWith(".routes.ts") || name.endsWith(".routes.js")) return true;
  if (name.endsWith(".controller.ts") || name.endsWith(".controller.js")) return true;
  if (name.endsWith(".service.ts") || name.endsWith(".service.js")) return true;
  if (name.endsWith(".repository.ts") || name.endsWith(".repository.js")) return true;
  if (name.startsWith("excel.")) return true;
  return false;
}

/** snake_case → camelCase 递归 */
function toCamel(data: any): any {
  if (Array.isArray(data)) return data.map(toCamel);
  if (data && typeof data === "object" && !(data instanceof Date)) {
    const o: any = {};
    for (const k of Object.keys(data)) o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = toCamel(data[k]);
    return o;
  }
  return data;
}

/** 包装 Router，自动 snake→camel */
function wrapCamel(r: Router): Router {
  const w = new Router();
  w.use(async (ctx, next) => { await next(); if (ctx.body && typeof ctx.body === "object") { const b: any = ctx.body; if (b.data) b.data = toCamel(b.data); if (b.rows) b.rows = toCamel(b.rows); } });
  w.use(r.routes(), r.allowedMethods());
  return w;
}

function scanAndRegister(baseDir: string, currentDir: string, apiRouter: Router): void {
  if (!existsSync(currentDir)) return;
  const entries = readdirSync(currentDir);
  const indexFile = entries.find((f) => f === "index.ts" || f === "index.js");
  const relPath = relative(baseDir, currentDir).replace(/\\/g, "/");
  const prefix = "/" + relPath;

  let hasConfig = false;

  if (indexFile) {
    try {
      const mod = require(join(currentDir, indexFile));

      // 导出 Router → 挂载自定义路由
      if (mod.default?.routes && mod.default?.allowedMethods) {
        // 检查是否同时有 config（混合模式：自定义 Router + 标准 CRUD）
        const mixedCfg = mod.config ?? (mod.default?.table && mod.default?.pkField ? mod.default : null);

        if (mixedCfg?.table && mixedCfg?.pkField) {
          // 混合模式：自定义 Router 先挂载（优先匹配，覆盖特定路由）
          //           CRUD 后挂载（作为兜底，补充未覆盖的标准路由）
          apiRouter.use(wrapCamel(mod.default).routes(), wrapCamel(mod.default).allowedMethods());
          const { defineCrudModule } = require("./crud");
          const cr = defineCrudModule({ ...mixedCfg, prefix });
          apiRouter.use(cr.routes(), cr.allowedMethods());
          return;
        }

        // 纯自定义模式：没有 config，只挂载自定义 Router
        apiRouter.use(wrapCamel(mod.default).routes(), wrapCamel(mod.default).allowedMethods());
        return;
      }

      if (mod.config) hasConfig = true;
      else if (mod.default?.table && mod.default?.pkField) { mod.config = mod.default; hasConfig = true; }

      registerFunctions(prefix, mod, apiRouter);
    } catch (e: any) { console.warn(`[router] failed to load ${indexFile}:`, e.message); }
  }

  for (const entry of entries) {
    if (entry === "index.ts" || entry === "index.js") continue;
    if (isIgnoredFile(entry)) continue;
    if (!entry.endsWith(".ts") && !entry.endsWith(".js")) continue;
    const filePath = join(currentDir, entry);
    try {
      if (lstatSync(filePath).isDirectory()) continue;
      const mod = require(filePath);
      if (mod.default?.routes && mod.default?.allowedMethods) {
        const sr = wrapCamel(mod.default);
        apiRouter.use(prefix, sr.routes(), sr.allowedMethods());
        continue;
      }
      registerFunctions(prefix, mod, apiRouter);
    } catch (e: any) { console.warn(`[router] failed to load ${entry}:`, e.message); }
  }

  if (hasConfig && indexFile) {
    const mod = require(join(currentDir, indexFile));
    const cfg = mod.config ?? (mod.default?.table ? mod.default : null);
    if (cfg?.table && cfg?.pkField) {
      const { defineCrudModule } = require("./crud");
      const cr = defineCrudModule({ ...cfg, prefix });
      apiRouter.use(cr.routes(), cr.allowedMethods());
      return;
    }
  }

  if (!indexFile) {
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try { if (lstatSync(fullPath).isDirectory() && !entry.startsWith(".") && !entry.startsWith("_")) scanAndRegister(baseDir, fullPath, apiRouter); } catch { /* skip */ }
    }
  }
}

function registerFunctions(prefix: string, mod: any, apiRouter: Router): void {
  const router = new Router({ prefix });
  let count = 0;
  for (const key of Object.keys(mod)) {
    if (key === "default" || key === "config" || key === "Router") continue;
    const fn = mod[key];
    if (typeof fn !== "function") continue;
    if (/^[A-Z]/.test(key)) continue;

    const path = "/" + camelToKebab(key);
    const method = inferMethod(key);
    const noAuth = key.startsWith("public") || key.startsWith("Public") || key === "login" || key === "logout" || key === "refresh";
    const middlewares: any[] = noAuth ? [] : [jwtAuth()];
    (router as any)[method](path, ...middlewares, async (ctx: Context) => {
      const data = await fn(ctx);
      if (data !== undefined) ctx.body = { code: 200, data: toCamel(data), message: "操作成功" };
    });
    count++;
  }
  if (count > 0) apiRouter.use(router.routes(), router.allowedMethods());
}

export function createRouter(): Router {
  const router = new Router({ prefix: "/api" });
  router.get("/health", (ctx) => { ctx.body = { status: "ok" }; });
  router.get("/metrics", (ctx) => { ctx.type = 'text/plain'; ctx.body = collectMetrics(); });

  router.get("/ready", async (ctx) => {
    const READY_TIMEOUT = 2_000;
    const services: Record<string, string> = {};

    const withTimeout = <T>(label: string, fn: () => Promise<T>): Promise<T> =>
      Promise.race([fn(), new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), READY_TIMEOUT))]);

    // MySQL
    try {
      await withTimeout('mysql', async () => {
        const { getDb } = require("./database");
        const db = await getDb();
        await db.selectFrom('sys_config').select('config_id').limit(1).execute();
      });
      services.mysql = "up";
    } catch { services.mysql = "down"; }

    // Redis
    try {
      await withTimeout('redis', async () => {
        const { getRedisClient } = require("../shared/utils/redis");
        const r = getRedisClient();
        if (r) await r.ping(); else throw new Error('disabled');
      });
      services.redis = "up";
    } catch {
      const { getRedisClient } = require("../shared/utils/redis");
      services.redis = getRedisClient() ? "down" : "disabled";
    }

    const allUp = Object.values(services).every((s) => s === "up" || s === "disabled");
    ctx.status = allUp ? 200 : 503;
    ctx.body = { status: allUp ? "ready" : "not_ready", services };
  });
  scanAndRegister(join(__dirname, "..", "api"), join(__dirname, "..", "api"), router);
  return router;
}
