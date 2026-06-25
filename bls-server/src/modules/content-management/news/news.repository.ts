import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';

export interface NewsArticleInput {
  id?: string;
  title: string;
  subtitle?: string | null;
  coverImage?: string | null;
  publishDate?: string | null;
  content?: string | null;
}

export class NewsRepository {
  private getTenantId() {
    return getCurrentTenantId() ?? '000000';
  }

  async list(pageNum = 1, pageSize = 10, keyword?: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const kw = keyword?.trim();

    let listQuery = db
      .selectFrom('qx_news_article')
      .select([
        'id',
        'tenant_id as tenantId',
        'title',
        'subtitle',
        'cover_image as coverImage',
        'publish_date as publishDate',
        'content',
        'created_at as createdAt',
        'updated_at as updatedAt',
      ])
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0);

    let countQuery = db
      .selectFrom('qx_news_article')
      .select((eb: any) => eb.fn.countAll().as('total'))
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0);

    if (kw) {
      const keywordLike = `%${kw}%`;
      listQuery = listQuery.where((eb: any) =>
        eb.or([
          eb('title', 'like', keywordLike),
          eb('subtitle', 'like', keywordLike),
        ]),
      );
      countQuery = countQuery.where((eb: any) =>
        eb.or([
          eb('title', 'like', keywordLike),
          eb('subtitle', 'like', keywordLike),
        ]),
      );
    }

    const [rows, totalRow] = await Promise.all([
      listQuery
        .orderBy('publish_date', 'desc')
        .orderBy('id', 'desc')
        .limit(pageSize)
        .offset((pageNum - 1) * pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(totalRow?.total ?? 0) };
  }

  async detail(id: string) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    return db
      .selectFrom('qx_news_article')
      .select([
        'id',
        'tenant_id as tenantId',
        'title',
        'subtitle',
        'cover_image as coverImage',
        'publish_date as publishDate',
        'content',
        'created_at as createdAt',
        'updated_at as updatedAt',
      ])
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0)
      .executeTakeFirst();
  }

  async add(input: NewsArticleInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    const id = input.id ?? `${Date.now()}`;

    await db
      .insertInto('qx_news_article')
      .values({
        id,
        tenant_id: tenantId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        cover_image: input.coverImage ?? null,
        publish_date: input.publishDate ?? null,
        content: input.content ?? null,
        is_deleted: 0,
      })
      .execute();

    return id;
  }

  async edit(id: string, input: NewsArticleInput) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db
      .updateTable('qx_news_article')
      .set({
        title: input.title,
        subtitle: input.subtitle ?? null,
        cover_image: input.coverImage ?? null,
        publish_date: input.publishDate ?? null,
        content: input.content ?? null,
      })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('is_deleted', '=', 0)
      .execute();
  }

  async remove(ids: string[]) {
    const db = await getDb();
    const tenantId = this.getTenantId();
    await db
      .updateTable('qx_news_article')
      .set({ is_deleted: 1 })
      .where('id', 'in', ids)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}
