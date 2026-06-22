import { execute, query, transaction } from '../../../core/database';
import { likeCondition } from '../../../core/sql';
import { PageColumnConfig, PageConfig, USER_PAGE_CODE } from './page-config.model';

export type PageSearchField = {
  dataIndex: string;
  columnName: string;
  queryKey?: string;
};

export class PageConfigRepository {
  async listPages(): Promise<PageConfig[]> {
    return query<PageConfig>(
      `SELECT page_id AS pageId, page_code AS pageCode, page_name AS pageName,
              enabled, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_page_config
       WHERE deleted = 0
       ORDER BY sort ASC, page_id ASC`,
    );
  }

  async getPageByCode(pageCode: string): Promise<PageConfig | null> {
    const rows = await query<PageConfig>(
      `SELECT page_id AS pageId, page_code AS pageCode, page_name AS pageName,
              enabled, sort, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_page_config
       WHERE page_code = :pageCode AND deleted = 0
       LIMIT 1`,
      { pageCode },
    );

    return rows[0] ?? null;
  }

  async getColumnsByPageCode(pageCode: string = USER_PAGE_CODE): Promise<PageColumnConfig[]> {
    return query<PageColumnConfig>(
      `SELECT column_id AS columnId, page_code AS pageCode, data_index AS dataIndex,
              title, order_num AS orderNum, visible, searchable, editable,
              ellipsis,
              form_type AS formType, value_enum_code AS valueEnumCode,
              placeholder, required
       FROM sys_page_column_config
       WHERE page_code = :pageCode AND deleted = 0
       ORDER BY order_num ASC, column_id ASC`,
      { pageCode },
    );
  }

  async createPage(page: Omit<PageConfig, 'pageId' | 'createTime' | 'updateTime'> & { pageId?: string }): Promise<string> {
    const pageId = page.pageId ?? `page_${page.pageCode}`;
    await execute(
      `INSERT INTO sys_page_config (page_id, page_code, page_name, enabled, sort, remark, deleted)
       VALUES (:pageId, :pageCode, :pageName, :enabled, :sort, :remark, 0)`,
      {
        pageId,
        pageCode: page.pageCode,
        pageName: page.pageName,
        enabled: page.enabled,
        sort: page.sort ?? 0,
        remark: page.remark ?? null,
      },
    );
    return pageId;
  }

  async updatePage(page: Pick<PageConfig, 'pageCode' | 'pageName' | 'enabled' | 'remark'> & { sort?: number }): Promise<void> {
    await execute(
      `UPDATE sys_page_config
       SET page_name = :pageName,
           enabled = :enabled,
           sort = :sort,
           remark = :remark
       WHERE page_code = :pageCode AND deleted = 0`,
      {
        pageCode: page.pageCode,
        pageName: page.pageName,
        enabled: page.enabled,
        sort: page.sort ?? 0,
        remark: page.remark ?? null,
      },
    );
  }

  async replaceColumns(pageCode: string, columns: PageColumnConfig[]): Promise<void> {
    await transaction(async (conn) => {
      await conn.execute(
        `DELETE FROM sys_page_column_config WHERE page_code = ?`,
        [pageCode],
      );

      for (const column of columns) {
        await conn.execute(
          `INSERT INTO sys_page_column_config (
            column_id, page_code, data_index, title, order_num,
            visible, searchable, editable, ellipsis,
            form_type, value_enum_code, placeholder, required, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            column.columnId,
            pageCode,
            column.dataIndex,
            column.title,
            column.orderNum,
            column.visible,
            column.searchable,
            column.editable,
            column.ellipsis ?? '0',
            column.formType ?? null,
            column.valueEnumCode ?? null,
            column.placeholder ?? null,
            column.required ?? '0',
          ],
        );
      }
    });
  }

  async savePageWithColumns(page: PageConfig, columns: PageColumnConfig[]): Promise<void> {
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE sys_page_config
         SET page_name = ?, enabled = ?, sort = ?, remark = ?
         WHERE page_code = ? AND deleted = 0`,
        [page.pageName, page.enabled, page.sort ?? 0, page.remark ?? null, page.pageCode],
      );

      await conn.execute(`DELETE FROM sys_page_column_config WHERE page_code = ?`, [page.pageCode]);

      for (const column of columns) {
        await conn.execute(
          `INSERT INTO sys_page_column_config (
            column_id, page_code, data_index, title, order_num,
            visible, searchable, editable, ellipsis,
            form_type, value_enum_code, placeholder, required, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            column.columnId,
            page.pageCode,
            column.dataIndex,
            column.title,
            column.orderNum,
            column.visible,
            column.searchable,
            column.editable,
            column.ellipsis ?? '0',
            column.formType ?? null,
            column.valueEnumCode ?? null,
            column.placeholder ?? null,
            column.required ?? '0',
          ],
        );
      }
    });
  }

  async buildSearchConditions(pageCode: string, query: Record<string, any>, fields: PageSearchField[]) {
    const columns = await this.getColumnsByPageCode(pageCode);
    const searchableFields = new Set(columns.filter((item) => item.searchable === '1').map((item) => item.dataIndex));
    const keyword = String(query.keyword ?? '').trim();

    return [
      ...fields.map((field) =>
        searchableFields.has(field.dataIndex)
          ? likeCondition(field.columnName, field.queryKey ?? field.dataIndex, query[field.queryKey ?? field.dataIndex])
          : { sql: '', params: {} },
      ),
      keyword && searchableFields.size
        ? {
            sql: `(${fields
              .filter((field) => searchableFields.has(field.dataIndex))
              .map((field) => `${field.columnName} LIKE :keyword`)
              .join(' OR ')})`,
            params: { keyword: `%${keyword}%` },
          }
        : { sql: '', params: {} },
    ];
  }
}

export const pageConfigRepository = new PageConfigRepository();
