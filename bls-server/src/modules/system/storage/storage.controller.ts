import type { Context } from "koa";
import { pageSuccess, success } from "../../../core/response";
import { getAuditActor, writeOperationLog } from "../../../core/audit";
import { getCurrentTenantId } from "../../../middleware/tenant";
import { StorageService } from "./storage.service";

export class StorageController {
  constructor(private readonly service = new StorageService()) {}

  list = async (ctx: Context) => {
    const result = await this.service.list(ctx.query as any);
    pageSuccess(ctx, result.rows, result.total);
  };

  listFiles = async (ctx: Context) => {
    const result = await this.service.listFiles(ctx.query as any);
    pageSuccess(ctx, result.rows, result.total);
  };

  defaultStorage = async (ctx: Context) => {
    success(ctx, await this.service.defaultStorage(), "查询成功");
  };

  detail = async (ctx: Context) => {
    success(ctx, await this.service.detail(ctx.params.storageId), "查询成功");
  };

  add = async (ctx: Context) => {
    const storageId = await this.service.add(ctx.request.body as any);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: "storage", businessType: "ADD", title: "新增存储配置", requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(ctx.request.body ?? {}), responseStatus: 200, success: "1" }).catch(() => undefined);
    success(ctx, { storageId }, "新增成功");
  };

  edit = async (ctx: Context) => {
    await this.service.edit(ctx.request.body as any);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: "storage", businessType: "UPDATE", title: "修改存储配置", requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(ctx.request.body ?? {}), responseStatus: 200, success: "1" }).catch(() => undefined);
    success(ctx, null, "修改成功");
  };

  upload = async (ctx: Context) => {
    success(
      ctx,
      await this.service.uploadFile(
        ctx,
        ctx.request.body as any,
        ctx.request.files,
      ),
      "上传成功",
    );
  };

  removeFile = async (ctx: Context) => {
    await this.service.deleteFile(ctx.params.fileId);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: "storage", businessType: "DELETE", title: "删除文件", requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify({ fileId: ctx.params.fileId }), responseStatus: 200, success: "1" }).catch(() => undefined);
    success(ctx, null, "删除成功");
  };

  fileUrl = async (ctx: Context) => {
    const result = await this.service.getFileUrl(ctx.params.fileId);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: "storage", businessType: "DOWNLOAD", title: "获取文件地址", requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify({ fileId: ctx.params.fileId }), responseStatus: 200, success: "1" }).catch(() => undefined);
    success(ctx, result, "查询成功");
  };

  downloadFile = async (ctx: Context) => {
    const result = await this.service.getFileUrl(ctx.params.fileId);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: "storage", businessType: "DOWNLOAD", title: "下载文件", requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify({ fileId: ctx.params.fileId }), responseStatus: 302, success: "1" }).catch(() => undefined);
    ctx.status = 302;
    ctx.redirect(result.url);
  };
}
