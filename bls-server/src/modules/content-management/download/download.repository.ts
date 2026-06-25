import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';

export interface DownloadInput {
  id?: string;
  fileName: string;
  fileFormat: string;
  fileSize?: number | null;
  fileUrl: string;
  uploadTime?: string | null;
}

export class DownloadRepository {
  private getTenantId() {
    return getCurrentTenantId() ?? '000000';
  }

  async list(pageNum = 1, pageSize = 10, keyword?: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const kw = keyword?.trim();

    let listQuery = db.selectFrom('qx_download_center').select([
      'id',
      'tenant_id as tenantId',
      'file_name as fileName',
      'file_format as fileFormat',
      'file_size as fileSize',
      'file_url as fileUrl',
      'upload_time as uploadTime',
      'created_at as createdAt',
      'updated_at as updatedAt',
    ]).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0);

    let countQuery = db.selectFrom('qx_download_center').select((eb: any) => eb.fn.countAll().as('total')).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0);

    if (kw) {
      const like = `%${kw}%`;
      const predicate = (eb: any) => eb.or([
        eb('file_name', 'like', like),
        eb('file_format', 'like', like),
      ]);
      listQuery = listQuery.where(predicate);
      countQuery = countQuery.where(predicate);
    }

    const [rows, totalRow] = await Promise.all([
      listQuery.orderBy('upload_time', 'desc').orderBy('id', 'desc').limit(pageSize).offset((pageNum - 1) * pageSize).execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(totalRow?.total ?? 0) };
  }

  async detail(id: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    return db.selectFrom('qx_download_center').select([
      'id',
      'tenant_id as tenantId',
      'file_name as fileName',
      'file_format as fileFormat',
      'file_size as fileSize',
      'file_url as fileUrl',
      'upload_time as uploadTime',
      'created_at as createdAt',
      'updated_at as updatedAt',
    ]).where('id', '=', id).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0).executeTakeFirst();
  }

  async add(input: DownloadInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const id = input.id ?? `${Date.now()}`;
    await db.insertInto('qx_download_center').values({
      id,
      tenant_id: tenantId,
      file_name: input.fileName,
      file_format: input.fileFormat,
      file_size: input.fileSize ?? 0,
      file_url: input.fileUrl,
      upload_time: input.uploadTime ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
      is_deleted: 0,
    }).execute();
    return id;
  }

  async edit(id: string, input: DownloadInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db.updateTable('qx_download_center').set({
      file_name: input.fileName,
      file_format: input.fileFormat,
      file_size: input.fileSize ?? 0,
      file_url: input.fileUrl,
      upload_time: input.uploadTime ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
    }).where('id', '=', id).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0).execute();
  }

  async remove(ids: string[]) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db.updateTable('qx_download_center').set({ is_deleted: 1 }).where('id', 'in', ids).where('tenant_id', '=', tenantId).execute();
  }
}
