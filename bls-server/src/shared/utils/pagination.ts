export interface PageQuery {
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface PageParams {
  pageNum: number;
  pageSize: number;
  offset: number;
}

export function getPageParams(query: PageQuery): PageParams {
  const pageNum = Math.max(Number(query.pageNum ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize ?? 10), 1), 200);
  return { pageNum, pageSize, offset: (pageNum - 1) * pageSize };
}
