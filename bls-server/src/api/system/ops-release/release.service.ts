import { releaseRepository } from './release.repository';
import { triggerDeployWorkflow } from './github-actions.service';
import { getRedisClient } from '../../../shared/utils/redis';
import { logger } from '../../../core/logger';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { sendToChannel } from './release.ws';
import { RELEASE_STEPS, ROLLBACK_STEPS, RELEASE_LOCK_PREFIX } from './release.constants';
import type { CreateReleaseRequest, StepStatus, StepKey } from './release.types';

// ====== Redis 锁（Lua 原子释放） ======

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

async function acquireLock(lockKey: string, environment: string): Promise<{ ok: boolean; token: string; error?: string }> {
  const redis = await getRedisClient();
  if (!redis) {
    if (environment === 'production') {
      return { ok: false, token: '', error: 'Redis 不可用，禁止生产环境发布' };
    }
    // staging 降级放行
    return { ok: true, token: 'no-redis' };
  }
  const token = generateSnowflakeId();
  const result = await redis.set(lockKey, token, 'PX', 600_000, 'NX');
  return { ok: result === 'OK', token };
}

async function releaseLock(lockKey: string, token: string): Promise<void> {
  const redis = await getRedisClient();
  try { if (redis) await redis.eval(UNLOCK_SCRIPT, 1, lockKey, token); } catch { /* ignore */ }
}

// ====== 辅助 ======

async function writeLog(taskId: string, stepKey: string | null, level: string, message: string): Promise<void> {
  try { await releaseRepository.appendLog(taskId, stepKey, level, message); } catch { /* ignore */ }
}

// ====== 发布服务 ======

export const releaseService = {
  async createRelease(
    input: CreateReleaseRequest,
    tenantId: string,
    triggeredBy: string,
    triggeredByName: string | null,
  ) {
    const builtVersions = await releaseRepository.getBuiltVersions();
    if (!builtVersions.find(v => v.version === input.version)) {
      return { error: `版本 ${input.version} 尚未构建完成` };
    }

    const lockKey = `${RELEASE_LOCK_PREFIX}${input.environment}`;
    const { ok: locked, token: lockToken, error: lockError } = await acquireLock(lockKey, input.environment);
    if (!locked) return { error: lockError || `${input.environment} 环境已有发布任务进行中` };

    const running = await releaseRepository.findRunningTask(input.environment, tenantId);
    if (running) { await releaseLock(lockKey, lockToken); return { error: `已有进行中任务 ${running.task_id}` }; }

    const lastTask = await releaseRepository.getLastSuccessfulVersion(input.environment, tenantId);
    const fromVersion = lastTask?.target_version || null;

    try {
      const servicesStr = input.services.join(' ');
      const task = await releaseRepository.createTask({
        tenantId, environment: input.environment, action: 'deploy',
        fromVersion, targetVersion: input.version, services: servicesStr,
        reason: input.reason, triggeredBy, triggeredByName,
        lockToken,
      });

      await writeLog(task.task_id, null, 'info', `发布任务创建: ${input.environment} → ${input.version}`);
      await releaseRepository.createSteps(task.task_id, RELEASE_STEPS);
      await releaseRepository.updateTaskStatus(task.task_id, 'checking');
      await releaseRepository.updateStepStatus(task.task_id, 'validate', 'success', { message: '参数校验通过' });

      triggerDeployWorkflow({
        action: 'deploy',
        version: input.version,
        environment: input.environment,
        taskId: task.task_id,
        services: servicesStr,
      }).then(async (result) => {
        if (result.runId) {
          await releaseRepository.updateTaskStatus(task.task_id, 'running', { github_run_id: result.runId });
          await releaseRepository.updateStepStatus(task.task_id, 'lock', 'success');
          await writeLog(task.task_id, 'lock', 'info', `runId=${result.runId}`);
          sendToChannel(task.task_id, {
            type: 'release_progress', taskId: task.task_id,
            status: 'running', stage: 'lock', progress: 20,
            message: 'GitHub Actions 已触发', timestamp: new Date().toISOString(),
          });
        } else {
          await releaseRepository.updateTaskStatus(task.task_id, 'failed', { error_message: result.error || '触发失败' });
          await releaseRepository.failAllRunningSteps(task.task_id);
          await writeLog(task.task_id, null, 'error', `触发失败: ${result.error}`);
          await releaseLock(lockKey, lockToken);
        }
      }).catch(async (err: any) => {
        await releaseRepository.updateTaskStatus(task.task_id, 'failed', { error_message: err.message });
        await releaseRepository.failAllRunningSteps(task.task_id);
        await writeLog(task.task_id, null, 'error', `异常: ${err.message}`);
        await releaseLock(lockKey, lockToken);
      });

      return { task };
    } catch (err: any) {
      await releaseLock(lockKey, lockToken);
      throw err;
    }
  },

  async handleCallback(body: { taskId: string; stage: StepKey; status: StepStatus; progress: number; message: string }) {
    const task = await releaseRepository.getTaskByIdInternal(body.taskId);
    if (!task) return { error: `任务 ${body.taskId} 不存在` };
    if (task.status !== 'running' && task.status !== 'checking' && task.status !== 'rolling_back') {
      return { error: `任务状态 ${task.status} 不接受回调` };
    }

    await releaseRepository.updateStepStatus(body.taskId, body.stage, body.status, {
      progress: body.progress, message: body.message,
    });
    await writeLog(body.taskId, body.stage, body.status === 'failed' ? 'error' : 'info', body.message);
    await releaseRepository.updateTaskStatus(body.taskId, task.status, {
      current_stage: body.stage, progress: body.progress,
    });

    sendToChannel(body.taskId, {
      type: 'release_progress', taskId: body.taskId,
      status: task.status, stage: body.stage,
      progress: body.progress, message: body.message,
      timestamp: new Date().toISOString(),
    });

    const envLockKey = `${RELEASE_LOCK_PREFIX}${task.environment}`;
    const lockToken = (task as any).lock_token || '';
    const sourceTaskId = (task as any).source_task_id || '';

    if (body.status === 'failed') {
      await releaseRepository.updateTaskStatus(body.taskId, 'failed', {
        error_message: body.message, current_stage: body.stage, progress: body.progress,
      });
      await writeLog(body.taskId, body.stage, 'error', `步骤失败: ${body.message}`);
      if (lockToken) await releaseLock(envLockKey, lockToken);

      // 回滚任务失败 → 恢复原任务为 failed
      if (sourceTaskId) {
        const sourceTask = await releaseRepository.getTaskByIdInternal(sourceTaskId);
        if (sourceTask && sourceTask.status === 'rolling_back') {
          await releaseRepository.updateTaskStatus(sourceTaskId, 'failed', {
            error_message: `回滚失败: ${body.message}`,
          });
          await writeLog(sourceTaskId, null, 'error', `回滚任务 ${body.taskId} 失败: ${body.message}`);
        }
      }
    }

    if (body.stage === 'complete' && body.status === 'success') {
      const finalStatus = task.action === 'rollback' ? 'rolled_back' : 'success';
      await releaseRepository.updateTaskStatus(body.taskId, finalStatus, { progress: 100 });
      await writeLog(body.taskId, 'complete', 'info', finalStatus === 'rolled_back' ? '回滚完成' : '发布完成');
      if (lockToken) await releaseLock(envLockKey, lockToken);

      // 回滚完成 → 更新原任务为 rolled_back
      if (sourceTaskId) {
        const sourceTask = await releaseRepository.getTaskByIdInternal(sourceTaskId);
        if (sourceTask && sourceTask.status === 'rolling_back') {
          await releaseRepository.updateTaskStatus(sourceTaskId, 'rolled_back', {
            rollback_version: task.target_version,
          });
          await writeLog(sourceTaskId, null, 'info', `回滚任务 ${body.taskId} 已完成，原任务标记为 rolled_back`);
        }
      }

      sendToChannel(body.taskId, {
        type: 'release_progress', taskId: body.taskId,
        status: finalStatus, stage: 'complete', progress: 100,
        message: finalStatus === 'rolled_back' ? '回滚完成' : '发布完成',
        timestamp: new Date().toISOString(),
      });
    }

    return { taskId: body.taskId };
  },

  async rollback(taskId: string, tenantId: string) {
    const task = await releaseRepository.getTaskById(taskId, tenantId);
    if (!task) return { error: '任务不存在' };
    if (task.status !== 'failed') return { error: `只有失败的任务才能回滚，当前状态: ${task.status}` };

    const targetVersion = task.from_version || task.rollback_version;
    if (!targetVersion) return { error: '无可用回滚版本' };

    const lockKey = `${RELEASE_LOCK_PREFIX}${task.environment}`;
    const { ok: locked, token: lockToken, error: lockError } = await acquireLock(lockKey, task.environment);
    if (!locked) return { error: lockError || `${task.environment} 环境已有发布任务进行中` };

    try {
      // 创建回滚任务，记录 source_task_id 和 lock_token
      const rollbackTask = await releaseRepository.createTask({
        tenantId,
        environment: task.environment,
        action: 'rollback',
        fromVersion: task.target_version,
        targetVersion,
        services: task.services,
        reason: `回滚失败发布 ${task.task_id}`,
        triggeredBy: task.triggered_by,
        triggeredByName: task.triggered_by_name,
        lockToken,
        sourceTaskId: taskId,
      });

      // 原任务标记 rolling_back
      await releaseRepository.updateTaskStatus(taskId, 'rolling_back');
      await writeLog(taskId, null, 'warn', `触发回滚任务 ${rollbackTask.task_id} → ${targetVersion}`);

      await releaseRepository.createSteps(rollbackTask.task_id, ROLLBACK_STEPS);
      await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'running');

      triggerDeployWorkflow({
        action: 'rollback',
        version: targetVersion,
        environment: task.environment,
        taskId: rollbackTask.task_id,
        services: task.services,
      }).then(async (result) => {
        if (!result.runId) {
          // 回滚触发失败 → 恢复原任务
          await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'failed', {
            error_message: result.error || 'GitHub Actions 触发失败',
          });
          await releaseRepository.updateTaskStatus(taskId, 'failed', {
            error_message: `回滚触发失败: ${result.error || '未知错误'}`,
          });
          await writeLog(rollbackTask.task_id, null, 'error', `触发失败: ${result.error}`);
          await writeLog(taskId, null, 'error', `回滚触发失败: ${result.error}`);
          await releaseLock(lockKey, lockToken);
        }
      }).catch(async (err: any) => {
        await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'failed', { error_message: err.message });
        await releaseRepository.updateTaskStatus(taskId, 'failed', { error_message: `回滚触发失败: ${err.message}` });
        await writeLog(rollbackTask.task_id, null, 'error', `异常: ${err.message}`);
        await writeLog(taskId, null, 'error', `回滚异常: ${err.message}`);
        await releaseLock(lockKey, lockToken);
      });

      return { taskId: rollbackTask.task_id, targetVersion };
    } catch (err: any) {
      await releaseLock(lockKey, lockToken);
      throw err;
    }
  },

  async getDeployableVersions() {
    return releaseRepository.getBuiltVersions();
  },
};
