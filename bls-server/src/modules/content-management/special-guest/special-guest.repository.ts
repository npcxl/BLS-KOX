import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';

export interface SpecialGuestInput {
  id?: string;
  name: string;
  title?: string | null;
  sortNo?: number | null;
  avatar?: string | null;
  description?: string | null;
  status?: number;
}

export class SpecialGuestRepository {
  private getTenantId() {
    return getCurrentTenantId() ?? '000000';
  }

  async list(pageNum = 1, pageSize = 10, keyword?: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const kw = keyword?.trim();

    let listQuery = db.selectFrom('qx_special_guest').select([
      'id',
      'tenant_id as tenantId',
      'name',
      'title',
      'sort_no as sortNo',
      'avatar',
      'description',
      'status',
      'created_at as createdAt',
      'updated_at as updatedAt',
    ]).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0);

    let countQuery = db.selectFrom('qx_special_guest').select((eb: any) => eb.fn.countAll().as('total')).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0);

    if (kw) {
      const like = `%${kw}%`;
      const predicate = (eb: any) => eb.or([
        eb('name', 'like', like),
        eb('title', 'like', like),
      ]);
      listQuery = listQuery.where(predicate);
      countQuery = countQuery.where(predicate);
    }

    const [rows, totalRow] = await Promise.all([
      listQuery.orderBy('sort_no', 'asc').orderBy('id', 'desc').limit(pageSize).offset((pageNum - 1) * pageSize).execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(totalRow?.total ?? 0) };
  }

  async detail(id: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    return db.selectFrom('qx_special_guest').select([
      'id',
      'tenant_id as tenantId',
      'name',
      'title',
      'sort_no as sortNo',
      'avatar',
      'description',
      'status',
      'created_at as createdAt',
      'updated_at as updatedAt',
    ]).where('id', '=', id).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0).executeTakeFirst();
  }

  async add(input: SpecialGuestInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const id = input.id ?? `${Date.now()}`;
    await db.insertInto('qx_special_guest').values({
      id,
      tenant_id: tenantId,
      name: input.name,
      title: input.title ?? null,
      sort_no: input.sortNo ?? 0,
      avatar: input.avatar ?? null,
      description: input.description ?? null,
      status: input.status ?? 0,
      is_deleted: 0,
    }).execute();
    return id;
  }

  async edit(id: string, input: SpecialGuestInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db.updateTable('qx_special_guest').set({
      name: input.name,
      title: input.title ?? null,
      sort_no: input.sortNo ?? 0,
      avatar: input.avatar ?? null,
      description: input.description ?? null,
      status: input.status ?? 0,
    }).where('id', '=', id).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0).execute();
  }

  async updateStatus(id: string, status: number) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db.updateTable('qx_special_guest').set({ status }).where('id', '=', id).where('tenant_id', '=', tenantId).where('is_deleted', '=', 0).execute();
  }

  async remove(ids: string[]) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db.updateTable('qx_special_guest').set({ is_deleted: 1 }).where('id', 'in', ids).where('tenant_id', '=', tenantId).execute();
  }
}
