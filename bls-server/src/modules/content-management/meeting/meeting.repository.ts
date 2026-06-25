import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';

export interface MeetingGuestInput {
  name: string;
  title?: string | null;
  avatar?: string | null;
}

export interface MeetingAgendaInput {
  time?: string | null;
  title: string;
  content?: string | null;
}

export interface MeetingInput {
  id?: string;
  meetingName: string;
  locationAddress?: string | null;
  meetingTime?: string | null;
  subtitle?: string | null;
  coverImage?: string | null;
  content?: string | null;
  guests?: MeetingGuestInput[];
  agenda?: MeetingAgendaInput[];
  status?: number;
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class MeetingRepository {
  private getTenantId() {
    return getCurrentTenantId() ?? '000000';
  }

  private normalizeGuests(value: unknown) {
    return safeJsonParse<MeetingGuestInput[]>(value, []);
  }

  private normalizeAgenda(value: unknown) {
    return safeJsonParse<MeetingAgendaInput[]>(value, []);
  }

  async list(pageNum = 1, pageSize = 10, keyword?: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const kw = keyword?.trim();

    let listQuery = db
      .selectFrom('qx_meeting')
      .select([
        'id',
        'tenant_id as tenantId',
        'meeting_name as meetingName',
        'location_address as locationAddress',
        'meeting_time as meetingTime',
        'subtitle',
        'cover_image as coverImage',
        'content',
        'guests_json as guestsJson',
        'agenda_json as agendaJson',
        'status',
        'created_at as createdAt',
        'updated_at as updatedAt',
      ])
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0);

    let countQuery = db
      .selectFrom('qx_meeting')
      .select((eb: any) => eb.fn.countAll().as('total'))
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0);

    if (kw) {
      const keywordLike = `%${kw}%`;
      const predicate = (eb: any) =>
        eb.or([
          eb('meeting_name', 'like', keywordLike),
          eb('subtitle', 'like', keywordLike),
          eb('location_address', 'like', keywordLike),
        ]);
      listQuery = listQuery.where(predicate);
      countQuery = countQuery.where(predicate);
    }

    const [rows, totalRow] = await Promise.all([
      listQuery
        .orderBy('meeting_time', 'asc')
        .orderBy('id', 'asc')
        .limit(pageSize)
        .offset((pageNum - 1) * pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return {
      rows: rows.map((row: any) => ({
        ...row,
        guests: this.normalizeGuests(row.guestsJson),
        agenda: this.normalizeAgenda(row.agendaJson),
      })),
      total: Number(totalRow?.total ?? 0),
    };
  }

  async detail(id: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const row = await db
      .selectFrom('qx_meeting')
      .select([
        'id',
        'tenant_id as tenantId',
        'meeting_name as meetingName',
        'location_address as locationAddress',
        'meeting_time as meetingTime',
        'subtitle',
        'cover_image as coverImage',
        'content',
        'guests_json as guestsJson',
        'agenda_json as agendaJson',
        'status',
        'created_at as createdAt',
        'updated_at as updatedAt',
      ]).orderBy('meeting_time', 'asc')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      ...row,
      guests: this.normalizeGuests((row as any).guestsJson),
      agenda: this.normalizeAgenda((row as any).agendaJson),
    };
  }

  async add(input: MeetingInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const id = input.id ?? `${Date.now()}`;

    await db
      .insertInto('qx_meeting')
      .values({
        id,
        tenant_id: tenantId,
        meeting_name: input.meetingName,
        location_address: input.locationAddress ?? null,
        meeting_time: input.meetingTime ?? null,
        subtitle: input.subtitle ?? null,
        cover_image: input.coverImage ?? null,
        content: input.content ?? null,
        guests_json: JSON.stringify(input.guests ?? []),
        agenda_json: JSON.stringify(input.agenda ?? []),
        status: input.status ?? 0,
        is_deleted: 0,
      })
      .execute();

    return id;
  }

  async edit(id: string, input: MeetingInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db
      .updateTable('qx_meeting')
      .set({
        meeting_name: input.meetingName,
        location_address: input.locationAddress ?? null,
        meeting_time: input.meetingTime ?? null,
        subtitle: input.subtitle ?? null,
        cover_image: input.coverImage ?? null,
        content: input.content ?? null,
        guests_json: JSON.stringify(input.guests ?? []),
        agenda_json: JSON.stringify(input.agenda ?? []),
        status: input.status ?? 0,
      })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0)
      .execute();
  }

  async updateStatus(id: string, status: number) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db
      .updateTable('qx_meeting')
      .set({ status })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0)
      .execute();
  }

  async remove(ids: string[]) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db
      .updateTable('qx_meeting')
      .set({ is_deleted: 1 })
      .where('id', 'in', ids)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}
