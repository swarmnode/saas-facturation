export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export function paginateParams(q: Record<string, any>): { page: number; limit: number; offset: number; all: boolean } {
  if (q.all === '1') return { page: 1, limit: 0, offset: 0, all: true };
  const limit  = Math.min(Math.max(Number(q.limit)  || 50, 1), 200);
  const page   = Math.max(Number(q.page) || 1, 1);
  return { page, limit, offset: (page - 1) * limit, all: false };
}

export function buildPage<T>(rows: (T & { _total?: string })[], page: number, limit: number): PageResult<T> {
  const total = rows.length > 0 ? Number(rows[0]._total ?? rows.length) : 0;
  const data  = rows.map(({ _total, ...rest }) => rest as T);
  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}
