import { Context } from 'koa';
import { pageSuccess } from '../../../core/response';
import { LogService } from './log.service';
import { LoginLogQuery, OperationLogQuery, UploadAuditQuery } from './log.model';

export class LogController {
  constructor(private readonly service = new LogService()) {}

  login = async (ctx: Context) => {
    const result = await this.service.listLoginLogs(ctx.query as LoginLogQuery);
    pageSuccess(ctx, result.rows, result.total);
  };

  operation = async (ctx: Context) => {
    const result = await this.service.listOperationLogs(ctx.query as OperationLogQuery);
    pageSuccess(ctx, result.rows, result.total);
  };

  upload = async (ctx: Context) => {
    const result = await this.service.listUploadAudits(ctx.query as UploadAuditQuery);
    pageSuccess(ctx, result.rows, result.total);
  };
}
