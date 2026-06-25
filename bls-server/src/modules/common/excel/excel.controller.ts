import type { Context } from 'koa';
import { ExcelService } from './excel.service';

const service = new ExcelService();

export class ExcelController {
  template = async (ctx: Context) => {
    const metaKey = String(ctx.query.metaKey ?? '');
    if (!metaKey) ctx.throw(400, 'metaKey不能为空');
    const result = await service.buildTemplate(metaKey);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    ctx.body = result.buffer;
  };

  export = async (ctx: Context) => {
    const result = await service.exportExcel(ctx, ctx.request.body as any);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    ctx.set('X-Excel-Matched-Count', String(result.matchedCount));
    ctx.set('X-Excel-Export-Count', String(result.exportCount));
    ctx.body = result.buffer;
  };

  import = async (ctx: Context) => {
    const metaKey = String((ctx.request.body as any)?.metaKey ?? (ctx.query as any)?.metaKey ?? '');
    if (!metaKey) ctx.throw(400, 'metaKey不能为空');
    const upload = (ctx.request.files as any)?.file;
    if (!upload) ctx.throw(400, '请上传Excel文件');
    const fileBuffer = upload.buffer ?? require('node:fs').readFileSync(upload.filepath);
    const result = await service.importExcel(ctx, metaKey, fileBuffer);
    if (result.errorBuffer) {
      ctx.set('X-Excel-Error-File', encodeURIComponent(`${metaKey}-错误明细.xlsx`));
      ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      ctx.body = result.errorBuffer;
      return;
    }
    ctx.body = { code: 200, data: result };
  };
}
