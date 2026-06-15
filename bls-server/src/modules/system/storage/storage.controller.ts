import type { Context } from 'koa';
import { StorageService } from './storage.service';

export class StorageController {
  constructor(private readonly service = new StorageService()) {}

  list = async (ctx: Context) => {
    ctx.body = { code: 200, data: await this.service.list(ctx.query as any) };
  };

  listFiles = async (ctx: Context) => {
    ctx.body = { code: 200, data: await this.service.listFiles(ctx.query as any) };
  };

  defaultStorage = async (ctx: Context) => {
    ctx.body = { code: 200, data: await this.service.defaultStorage() };
  };

  detail = async (ctx: Context) => {
    ctx.body = { code: 200, data: await this.service.detail(ctx.params.storageId) };
  };

  add = async (ctx: Context) => {
    ctx.body = { code: 200, data: await this.service.add(ctx.request.body as any) };
  };

  edit = async (ctx: Context) => {
    await this.service.edit(ctx.request.body as any);
    ctx.body = { code: 200, message: 'ok' };
  };
}
