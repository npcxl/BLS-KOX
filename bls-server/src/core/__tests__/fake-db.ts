/**
 * 内存版 Kysely 替身（仅覆盖 CRUD 工厂用到的 API 子集）
 *
 * 目标：让 CRUD 工厂的租户 / 软删除 / Data Scope 条件在「真正执行的查询」上可被断言。
 * 支持：selectFrom/insertInto/updateTable/deleteFrom、where(cb|col,op,val)、
 *      or / in / like / countAll、orderBy/limit/offset、transaction（含回滚）。
 */

export type Row = Record<string, any>;

type Pred = (row: Row) => boolean;

interface Cond {
  col: string;
  op: string;
  val: any;
}

interface OrCond {
  or: Cond[];
}

interface State {
  filters: Pred[];
  sets: Row | null;
  values: Row | Row[] | null;
  selectAll: boolean;
  projection: string[] | null;
  count: boolean;
  countAlias: string;
  order: { col: string; dir: 'asc' | 'desc' } | null;
  limit: number | null;
  offset: number | null;
}

function emptyState(): State {
  return {
    filters: [], sets: null, values: null,
    selectAll: false, projection: null, count: false, countAlias: 'total',
    order: null, limit: null, offset: null,
  };
}

function matchCond(row: Row, cond: Cond): boolean {
  const value = row[cond.col];
  switch (cond.op) {
    case '=': return String(value) === String(cond.val);
    case '!=': return String(value) !== String(cond.val);
    case 'is':
      return cond.val === null || cond.val === undefined
        ? value === null || value === undefined
        : String(value) === String(cond.val);
    case '>': return value !== null && value !== undefined && String(value) > String(cond.val);
    case '<': return value !== null && value !== undefined && String(value) < String(cond.val);
    case '>=': return value !== null && value !== undefined && String(value) >= String(cond.val);
    case '<=': return value !== null && value !== undefined && String(value) <= String(cond.val);
    case 'in': return Array.isArray(cond.val) && cond.val.map(String).includes(String(value));
    case 'like': {
      const pattern = String(cond.val).replace(/%/g, '');
      return String(value ?? '').includes(pattern);
    }
    default: throw new Error(`unsupported op ${cond.op}`);
  }
}

function toPred(cond: any): Pred {
  if (cond === false) return () => false;
  if (typeof cond === 'function') return cond as Pred;
  if (cond && typeof cond === 'object' && Array.isArray((cond as OrCond).or)) {
    const conds = (cond as OrCond).or;
    return (row) => conds.some((c) => matchCond(row, c));
  }
  if (cond && typeof cond === 'object' && 'col' in cond) {
    const c = cond as Cond;
    return (row) => matchCond(row, c);
  }
  throw new Error('unsupported where condition');
}

function exprBuilder(col?: string, op?: string, val?: any): any {
  const eb: any = (c: string, o: string, v: any) => ({ col: c, op: o, val: v } satisfies Cond);
  eb.or = (conds: any[]) => ({ or: conds } satisfies OrCond);
  eb.fn = {
    countAll: () => ({
      __countAll: true,
      as: (alias: string) => ({ __count: alias }),
    }),
  };
  if (col !== undefined) return eb(col, op as string, val);
  return eb;
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** 事务快照栈，用于回滚 */
  private snapshots: Array<Record<string, Row[]>> = [];
  inTransaction = false;
  transactionCount = 0;
  commitCount = 0;
  rollbackCount = 0;

  seed(table: string, rows: Row[]): void {
    this.tables[table] = rows.map((r) => ({ ...r }));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  private snapshot(): Record<string, Row[]> {
    const copy: Record<string, Row[]> = {};
    for (const [k, v] of Object.entries(this.tables)) copy[k] = v.map((r) => ({ ...r }));
    return copy;
  }

  private restore(snap: Record<string, Row[]>): void {
    this.tables = snap;
  }

  selectFrom(table: string): FakeBuilder {
    return new FakeBuilder(this, 'select', table, { ...emptyState(), selectAll: true });
  }

  insertInto(table: string): FakeBuilder {
    return new FakeBuilder(this, 'insert', table, emptyState());
  }

  updateTable(table: string): FakeBuilder {
    return new FakeBuilder(this, 'update', table, emptyState());
  }

  deleteFrom(table: string): FakeBuilder {
    return new FakeBuilder(this, 'delete', table, emptyState());
  }

  transaction(): { execute: <T>(cb: (trx: FakeDb) => Promise<T>) => Promise<T> } {
    return {
      execute: async <T>(cb: (trx: FakeDb) => Promise<T>): Promise<T> => {
        this.transactionCount++;
        const snap = this.snapshot();
        this.snapshots.push(snap);
        const prevInTx = this.inTransaction;
        this.inTransaction = true;
        try {
          const result = await cb(this);
          this.commitCount++;
          return result;
        } catch (error) {
          this.restore(snap);
          this.rollbackCount++;
          throw error;
        } finally {
          this.inTransaction = prevInTx;
          this.snapshots.pop();
        }
      },
    };
  }
}

export class FakeBuilder {
  constructor(
    private db: FakeDb,
    private op: 'select' | 'insert' | 'update' | 'delete',
    private table: string,
    private state: State,
  ) {}

  private clone(patch: Partial<State>): FakeBuilder {
    return new FakeBuilder(this.db, this.op, this.table, { ...this.state, ...patch });
  }

  selectAll(): FakeBuilder {
    return this.clone({ selectAll: true, projection: null });
  }

  select(cols?: any): FakeBuilder {
    if (typeof cols === 'function') {
      const result = cols(exprBuilder());
      if (result && typeof result === 'object' && '__count' in result) {
        return this.clone({ count: true, selectAll: false, projection: null, countAlias: String(result.__count) });
      }
      return this.clone({});
    }
    if (Array.isArray(cols)) {
      return this.clone({ projection: cols.map(String), selectAll: false });
    }
    if (typeof cols === 'string') {
      return this.clone({ projection: [cols], selectAll: false });
    }
    return this.clone({});
  }

  clearSelect(): FakeBuilder {
    return this.clone({ selectAll: false, projection: null, count: false });
  }

  where(a: any, b?: any, c?: any): FakeBuilder {
    const pred = typeof a === 'function' ? toPred(a(exprBuilder())) : toPred(exprBuilder(a, b, c));
    return this.clone({ filters: [...this.state.filters, pred] });
  }

  orderBy(col: string, dir: 'asc' | 'desc' = 'asc'): FakeBuilder {
    return this.clone({ order: { col, dir } });
  }

  limit(n: number): FakeBuilder {
    return this.clone({ limit: n });
  }

  offset(n: number): FakeBuilder {
    return this.clone({ offset: n });
  }

  values(values: Row | Row[]): FakeBuilder {
    return this.clone({ values });
  }

  set(sets: Row): FakeBuilder {
    return this.clone({ sets });
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.state.filters.every((f) => f(row)));
  }

  async executeTakeFirst(): Promise<any> {
    if (this.op === 'select') {
      if (this.state.count) {
        return { [this.state.countAlias]: this.matching().length };
      }
      const rows = await this.execute();
      return rows[0];
    }
    if (this.op === 'update') {
      const rows = this.matching();
      for (const row of rows) Object.assign(row, this.state.sets ?? {});
      return { numUpdatedRows: BigInt(rows.length) };
    }
    if (this.op === 'delete') {
      const rows = this.matching();
      const ids = new Set(rows);
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !ids.has(r));
      return { numDeletedRows: BigInt(rows.length) };
    }
    return undefined;
  }

  async execute(): Promise<Row[]> {
    if (this.op === 'insert') {
      const list: Row[] = Array.isArray(this.state.values)
        ? this.state.values
        : [this.state.values ?? {}];
      const target = this.db.rows(this.table);
      const inserted: Row[] = [];
      for (const raw of list) {
        const values = { ...raw };
        // 复合键 = 全部非空 *_id 列（单主键表→主键；关联表→复合主键），与真实 DB 的唯一约束近似
        const idKeys = Object.keys(values).filter((k) => k.endsWith('_id') && values[k] !== null && values[k] !== undefined);
        if (idKeys.length > 0 && target.some((r) => idKeys.every((k) => String(r[k]) === String(values[k])))) {
          throw new Error('Duplicate entry');
        }
        target.push(values);
        inserted.push(values);
      }
      return inserted;
    }

    if (this.op === 'update') {
      const rows = this.matching();
      for (const row of rows) Object.assign(row, this.state.sets ?? {});
      return rows;
    }

    if (this.op === 'delete') {
      const rows = this.matching();
      const ids = new Set(rows);
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !ids.has(r));
      return rows;
    }

    let rows = this.matching().map((r) => ({ ...r }));
    if (this.state.projection) {
      const keys = this.state.projection;
      rows = rows.map((r) => {
        const picked: Row = {};
        for (const key of keys) if (key in r) picked[key] = r[key];
        return picked;
      });
    }
    if (this.state.order) {
      const { col, dir } = this.state.order;
      rows = rows.sort((x, y) => (String(x[col]) > String(y[col]) ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    }
    if (this.state.offset) rows = rows.slice(this.state.offset);
    if (this.state.limit !== null) rows = rows.slice(0, this.state.limit);
    return rows;
  }
}
