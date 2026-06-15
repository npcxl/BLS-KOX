import { Context } from 'koa';
import { success } from '../../../core/response';
import { PageConfigService } from './page-config.service';

export class PageConfigController {
  constructor(private readonly service = new PageConfigService()) {}

  list = async (ctx: Context): Promise<void> => {
    success(ctx, await this.service.list(), '查询成功');
  };

  detail = async (ctx: Context): Promise<void> => {
    const pageCode = String(ctx.params.pageCode || '').trim();
    success(ctx, await this.service.getByCode(pageCode), '查询成功');
  };
}
