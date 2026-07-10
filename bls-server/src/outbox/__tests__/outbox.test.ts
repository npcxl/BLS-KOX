import { describe, it, expect } from 'vitest';
import { appendEvent, fetchPending, markPublished, markFailed, recoverStale, OutboxEvent } from '../outbox';

class WhereBuilder {
  wheres: { col: string; op: string; val: any }[] = [];
  constructor(protected rows: any[], _table?: string) {}
  where(col: any, op?: any, val?: any) {
    if (typeof col === 'function') return this;
    this.wheres.push({ col, op, val });
    return this;
  }
  protected matches(row: any): boolean {
    return this.wheres.every(({ col, op, val }) => {
      const v = row[col];
      switch (op) {
        case '=': return String(v) === String(val);
        case '<=': return new Date(v).getTime() <= new Date(val).getTime();
        case '>=': return new Date(v).getTime() >= new Date(val).getTime();
        case '<': return new Date(v).getTime() < new Date(val).getTime();
        case '>': return new Date(v).getTime() > new Date(val).getTime();
        case 'in': return Array.isArray(val); val.map(String).includes(String(v));
        default: return true;
      }
    });
  }
}

class SelectBuilder extends WhereBuilder {
  private orderByCol?: string;
  private orderDir: 'asc' | 'desc' = 'asc';
  private lim = Infinity;
  selectAll() { return this; }
  select() { return this; }
  orderBy(col: string, dir: 'asc' | 'desc' = 'asc') { this.orderByCol = col; this.orderDir = dir; return this; }
  limit(n: number) { this.lim = n; return this; }
  forUpdate() { return this; }
  skipLocked() { return this; }
  private filtered() {
    let rs = this.rows.filter((r) => this.matches(r));
    if (this.orderByCol) {
      rs = [...rs].sort((a, b) => {
        const av = new Date(a[this.orderByCol!]).getTime();
        const bv = new Date(b[this.orderByCol!]).getTime();
        return this.orderDir === 'asc' ? av - bv : bv - av;
      });
    }
    return rs.slice(0, this.lim);
  }
  async execute() { return this.filtered(); }
  async executeTakeFirst() { const f = this.filtered(); return f[0] ?? null; }
}

class UpdateBuilder extends WhereBuilder {
  private setVal: any = {};
  set(obj: any) { this.setVal = obj; return this; }
  async execute() {
    for (const r of this.rows) if (this.matches(r)) Object.assign(r, this.setVal);
    return [];
  }
}

class InsertBuilder {
  constructor(private rows: any[], _table?: string) {}
  private vals: any = {};
  values(obj: any) { this.vals = obj; return this; }
  async execute() {
    this.rows.push({ ...this.vals });
    return [{ insertId: this.rows.length }];
  }
  async executeTakeFirst() { return (await this.execute())[0]; }
}

class FakeDb {
  rows: any[] = [];
  private lock: Promise<void> = Promise.resolve();
  selectFrom(table: string) { return new SelectBuilder(this.rows, table); }
  updateTable(table: string) { return new UpdateBuilder(this.rows, table); }
  insertInto(table: string) { return new InsertBuilder(this.rows, table); }
  transaction() {
    return {
      execute: async (fn: (trx: any) => Promise<any>) => {
        let release!: () => void;
        const next = new Promise<void>((r) => (release = r));
        const prev = this.lock;
        this.lock = this.lock.then(() => next);
        await prev;
        try { return await fn(this); } finally { release(); }
      },
    };
  }
}

function makeProcessingRow(id: string, processingAt: Date): any {
  return {
    event_id: id, tenant_id: 't', event_type: 'X', aggregate_type: null, aggregate_id: null,
    payload_json: '{}', status: 'processing', retry_count: 1, next_retry_at: null,
    processing_at: processingAt, created_at: new Date(), published_at: null,
  };
}

describe('P7 Outbox', () => {
  it('atomic claim: only one of two concurrent fetchPending claims the same event', async () => {
    const db = new FakeDb();
    await appendEvent(db, { tenantId: 't1', eventType: 'X' });
    const [a, b] = await Promise.all([fetchPending(db), fetchPending(db)]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed.length).toBe(1);
    const third = await fetchPending(db);
    expect(third).toBeNull();
  });

  it('handler success -> markPublished', async () => {
    const db = new FakeDb();
    await appendEvent(db, { tenantId: 't', eventType: 'X' });
    const event = (await fetchPending(db))!;
    expect(event).not.toBeNull();
    await markPublished(db, event!.eventId);
    const row = db.rows.find((r) => r.event_id === event!.eventId);
    expect(row.status).toBe('published');
    expect(row.published_at).toBeTruthy();
    expect(row.processing_at).toBeNull();
  });

  it('handler failure -> markFailed returns to pending with future next_retry_at', async () => {
    const db = new FakeDb();
    await appendEvent(db, { tenantId: 't', eventType: 'X' });
    const event = (await fetchPending(db))!;
    await markFailed(db, event!.eventId, event!, 'boom');
    const row = db.rows.find((r) => r.event_id === event!.eventId);
    expect(row.status).toBe('pending');
    expect(new Date(row.next_retry_at).getTime()).toBeGreaterThan(Date.now());
    expect(row.processing_at).toBeNull();
  });

  it('dead letter: retryCount at limit -> dead', async () => {
    const db = new FakeDb();
    await appendEvent(db, { tenantId: 't', eventType: 'X' });
    const event = (await fetchPending(db))!;
    const record: OutboxEvent = { ...event!, retryCount: 3 };
    await markFailed(db, event!.eventId, record, 'boom');
    const row = db.rows.find((r) => r.event_id === event!.eventId);
    expect(row.status).toBe('dead');
    expect(row.processing_at).toBeNull();
  });

  it('stale recovery (P0): old processing -> pending; new processing -> stays processing', async () => {
    const db = new FakeDb();
    db.rows.push(makeProcessingRow('e-old', new Date(Date.now() - 10 * 60 * 1000)));
    db.rows.push(makeProcessingRow('e-new', new Date()));
    await recoverStale(db);
    const oldRow = db.rows.find((r) => r.event_id === 'e-old')!;
    const newRow = db.rows.find((r) => r.event_id === 'e-new')!;
    expect(oldRow.status).toBe('pending');
    expect(newRow.status).toBe('processing');
  });

  it('stale recovery uses processing_at not next_retry_at (regression guard)', async () => {
    const db = new FakeDb();
    const row = makeProcessingRow('e', new Date());
    row.next_retry_at = new Date(Date.now() - 10 * 60 * 1000);
    db.rows.push(row);
    await recoverStale(db);
    expect(db.rows[0].status).toBe('processing');
  });

  it('fetchPending triggers recoverStale: stale processing becomes claimable', async () => {
    const db = new FakeDb();
    db.rows.push(makeProcessingRow('e-stale', new Date(Date.now() - 10 * 60 * 1000)));
    const event = await fetchPending(db);
    expect(event).not.toBeNull();
    expect(event!.eventId).toBe('e-stale');
    expect(event!.status).toBe('processing');
  });
});
