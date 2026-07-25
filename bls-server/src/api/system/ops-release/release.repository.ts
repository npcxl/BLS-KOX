import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import type { ReleaseTask, ReleaseStep, TaskStatus, StepKey, StepStatus, DeployableVersion } from './release.types';

const TASK_TABLE = 'ops_release_task';
const STEP_TABLE = 'ops_release_step';
const LOG_TABLE = 'ops_release_log';
const VERSION_TABLE = 'ops_release_version';

export const releaseRepository = {
  // ========== 任务 ==========

  async createTask(data: {
    tenantId: string; environment: string; action: string;
    fromVersion: string | null; targetVersion: string; services: string;
    reason: string | null; triggeredBy: string; triggeredByName: string | null;
    lockToken?: string | null; sourceTaskId?: string | null;
  }): Promise<ReleaseTask> {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const taskId = generateSnowflakeId();
    await db.insertInto(TASK_TABLE).values({
      task_id: taskId, tenant_id: data.tenantId, environment: data.environment,
      action: data.action, from_version: data.fromVersion, target_version: data.targetVersion,
      services: data.services, status: 'pending', current_stage: null, progress: 0,
      reason: data.reason, github_run_id: null, triggered_by: data.triggeredBy,
      triggered_by_name: data.triggeredByName, started_at: null, finished_at: null,
      error_message: null, rollback_version: null,
      lock_token: data.lockToken || null, source_task_id: data.sourceTaskId || null,
      deleted: 0, create_time: now, update_time: now,
    }).execute();
    return this.getTaskById(taskId, data.tenantId) as Promise<ReleaseTask>;
  },

  async getTaskById(taskId: string, tenantId: string): Promise<ReleaseTask | null> {
    const db = (await getDb()) as any;
    return db.selectFrom(TASK_TABLE).selectAll()
      .where('task_id', '=', taskId).where('tenant_id', '=', tenantId).where('deleted', '=', 0)
      .executeTakeFirst() as Promise<ReleaseTask | null>;
  },

  /** 内部调用：不校验租户（回调/回滚内部使用） */
  async getTaskByIdInternal(taskId: string): Promise<ReleaseTask | null> {
    const db = (await getDb()) as any;
    return db.selectFrom(TASK_TABLE).selectAll()
      .where('task_id', '=', taskId).where('deleted', '=', 0)
      .executeTakeFirst() as Promise<ReleaseTask | null>;
  },

  async listTasks(tenantId: string, pageNum: number, pageSize: number) {
    const db = (await getDb()) as any;
    const offset = (pageNum - 1) * pageSize;
    const base = db.selectFrom(TASK_TABLE).selectAll()
      .where('tenant_id', '=', tenantId).where('deleted', '=', 0).orderBy('create_time', 'desc');
    const [rows, countRow] = await Promise.all([
      base.limit(pageSize).offset(offset).execute(),
      db.selectFrom(TASK_TABLE).select((eb: any) => eb.fn.countAll().as('total'))
        .where('tenant_id', '=', tenantId).where('deleted', '=', 0).executeTakeFirst(),
    ]);
    return { rows: rows as ReleaseTask[], total: Number((countRow as any)?.total ?? 0) };
  },

  async updateTaskStatus(taskId: string, status: TaskStatus, extra: Record<string, any> = {}) {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const d: any = { status, update_time: now, ...extra };
    if (status === 'running' && !extra.started_at) d.started_at = now;
    if (['success', 'failed', 'rolled_back', 'cancelled'].includes(status)) d.finished_at = now;
    await db.updateTable(TASK_TABLE).set(d).where('task_id', '=', taskId).execute();
  },

  async findRunningTask(environment: string, tenantId: string): Promise<ReleaseTask | null> {
    const db = (await getDb()) as any;
    return db.selectFrom(TASK_TABLE).selectAll()
      .where('environment', '=', environment).where('tenant_id', '=', tenantId)
      .where('deleted', '=', 0).where('status', 'in', ['pending', 'checking', 'waiting_approval', 'running', 'rolling_back'])
      .orderBy('create_time', 'desc').limit(1).executeTakeFirst() as Promise<ReleaseTask | null>;
  },

  async getLastSuccessfulVersion(environment: string, tenantId: string) {
    const db = (await getDb()) as any;
    const row: any = await db.selectFrom(TASK_TABLE).selectAll()
      .where('environment', '=', environment).where('tenant_id', '=', tenantId)
      .where('deleted', '=', 0).where('status', '=', 'success').where('action', '=', 'deploy')
      .orderBy('create_time', 'desc').limit(1).executeTakeFirst();
    return row || null;
  },

  // ========== 步骤 ==========

  async createSteps(taskId: string, steps: Array<{ key: StepKey; name: string; order: number }>) {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    for (const s of steps) {
      await db.insertInto(STEP_TABLE).values({
        step_id: generateSnowflakeId(), task_id: taskId, step_key: s.key,
        step_name: s.name, step_order: s.order, status: 'waiting' as StepStatus,
        progress: 0, message: null, started_at: null, finished_at: null,
        duration_ms: null, create_time: now, update_time: now,
      }).execute();
    }
  },

  async getSteps(taskId: string): Promise<ReleaseStep[]> {
    const db = (await getDb()) as any;
    return db.selectFrom(STEP_TABLE).selectAll().where('task_id', '=', taskId)
      .orderBy('step_order', 'asc').execute() as Promise<ReleaseStep[]>;
  },

  async updateStepStatus(taskId: string, stepKey: StepKey, status: StepStatus, extra: Record<string, any> = {}) {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const d: any = { status, update_time: now, ...extra };
    if (status === 'running' && !extra.started_at) d.started_at = now;
    if (['success', 'failed', 'skipped', 'rollback', 'cancelled'].includes(status)) d.finished_at = now;
    await db.updateTable(STEP_TABLE).set(d).where('task_id', '=', taskId).where('step_key', '=', stepKey).execute();
  },

  async failAllRunningSteps(taskId: string) {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.updateTable(STEP_TABLE).set({ status: 'failed', finished_at: now, update_time: now })
      .where('task_id', '=', taskId).where('status', 'in', ['waiting', 'running']).execute();
  },

  // ========== 日志 ==========

  async appendLog(taskId: string, stepKey: string | null, level: string, message: string) {
    const db = (await getDb()) as any;
    const safeMsg = message.length > 5000 ? message.slice(0, 5000) + '...[truncated]' : message;
    await db.insertInto(LOG_TABLE).values({
      log_id: generateSnowflakeId(), task_id: taskId, step_key: stepKey,
      level, message: safeMsg,
    }).execute();
  },

  async getLogs(taskId: string, limit = 100) {
    const db = (await getDb()) as any;
    const rows: any = await db.selectFrom(LOG_TABLE).selectAll()
      .where('task_id', '=', taskId).orderBy('created_at', 'asc').limit(limit).execute();
    return rows.map((r: any) => ({
      logId: r.log_id, stepKey: r.step_key, level: r.level,
      message: r.message, createdAt: r.created_at,
    }));
  },

  // ========== 版本记录 ==========

  async upsertVersionRecord(version: string, status: string, commitHash?: string, services?: string[]) {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const existing: any = await db.selectFrom(VERSION_TABLE).select('version_id').where('version', '=', version).executeTakeFirst();
    if (existing) {
      await db.updateTable(VERSION_TABLE).set({
        status, commit_hash: commitHash || null,
        services: services ? JSON.stringify(services) : null,
        built_at: status === 'built' ? now : null, update_time: now,
      }).where('version', '=', version).execute();
    } else {
      await db.insertInto(VERSION_TABLE).values({
        version_id: generateSnowflakeId(), version, commit_hash: commitHash || null,
        status, services: services ? JSON.stringify(services) : null,
        built_at: status === 'built' ? now : null, tenant_id: '000000',
        deleted: 0, create_time: now, update_time: now,
      }).execute();
    }
  },

  async getBuiltVersions(): Promise<DeployableVersion[]> {
    const db = (await getDb()) as any;
    const rows: any = await db.selectFrom(VERSION_TABLE).selectAll()
      .where('status', '=', 'built').where('deleted', '=', 0)
      .orderBy('create_time', 'desc').limit(20).execute();
    return rows.map((r: any) => ({
      version: r.version, commitHash: r.commit_hash || '',
      builtAt: r.built_at || '', available: true,
    }));
  },
};
