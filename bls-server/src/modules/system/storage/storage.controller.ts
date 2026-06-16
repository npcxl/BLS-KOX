import type { Context } from 'koa';
import { pageSuccess, success } from '../../../core/response';
import { StorageService } from './storage.service';

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
    success(ctx, await this.service.defaultStorage(), '查询成功');
  };

  detail = async (ctx: Context) => {
    success(ctx, await this.service.detail(ctx.params.storageId), '查询成功');
  };

  add = async (ctx: Context) => {
    success(ctx, { storageId: await this.service.add(ctx.request.body as any) }, '新增成功');
  };

  edit = async (ctx: Context) => {
    await this.service.edit(ctx.request.body as any);
    success(ctx, null, '修改成功');
  };

  upload = async (ctx: Context) => {
    success(ctx, await this.service.uploadFile(ctx.request.body as any, ctx.request.files), '上传成功');
  };

  removeFile = async (ctx: Context) => {
    await this.service.deleteFile(ctx.params.fileId);
    success(ctx, null, '删除成功');
  };

  fileUrl = async (ctx: Context) => {
    success(ctx, await this.service.getFileUrl(ctx.params.fileId), '查询成功');
  };

  downloadFile = async (ctx: Context) => {
    const result = await this.service.getFileUrl(ctx.params.fileId);
    ctx.redirect(result.url);
  };
}
