import { releaseRepository } from './release.repository';
import { triggerDeployWorkflow } from './github-actions.service';
import { getRedisClient } from '../../../shared/utils/redis';
import { logger } from '../../../core/logger';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { sendToChannel } from './release.ws';
import {
  RELEASE_STEPS, ROLLBACK_STEPS,
  RELEASE_LOCK_PREFIX,
} from './release.constants';
import type { CreateReleaseRequest, StepStatus, StepKey } from './release.types';

// ====== Redis 锁（Lua 原子释放，统一入口） ======

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

async function acquireLock(lockKey: string): Promise<{ ok: boolean; token: string }> {
  const redis = await getRedisClient();
  const token = generateSnowflakeId();
  if (redis) {
    const result = await redis.set(lockKey, token, 'PX', 600_000, 'NX');
    return { ok: result === 'OK', token };
  }
  return { ok: true, token };
}

async function releaseLock(lockKey: string, token: string): Promise<void> {
  const redis = await getRedisClient();
  try {
    if (redis) await redis.eval(UNLOCK_SCRIPT, 1, lockKey, token);
  } catch { /* ignore */ }
}

// ====== 辅助 ======

async function writeLog(taskId: string, stepKey: string | null, level: string, message: string): Promise<void> {
  try { await releaseRepository.appendLog(taskId, stepKey, level, message); } catch { /* ignore */ }
}

/** 任务失败并释放锁 */
async function failTask(taskId: string, errorMessage: string, lockKey: string, lockToken: string) {
  await releaseRepository.updateTaskStatus(taskId, 'failed', { error_message: errorMessage });
  await releaseRepository.failAllRunningSteps(taskId);
  await writeLog(taskId, null, 'error', errorMessage);
  await releaseLock(lockKey, lockToken);
}

/** 回滚失败时同步恢复原任务 */
async function failRollbackAndRestore(
  rollbackTaskId: string, sourceTaskId: string,
  errorMessage: string, lockKey: string, lockToken: string,
) {
  await releaseRepository.updateTaskStatus(rollbackTaskId, 'failed', { error_message: errorMessage });
  await releaseRepository.failAllRunningSteps(rollbackTaskId);
  await writeLog(rollbackTaskId, null, 'error', errorMessage);
  // 恢复原任务
  await releaseRepository.updateTaskStatus(sourceTaskId, 'failed', {
    error_message: `回滚失败: ${errorMessage}`,
  });
  await writeLog(sourceTaskId, null, 'error', `回滚失败: ${errorMessage}`);
  await releaseLock(lockKey, lockToken);
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
    const { ok: locked, token: lockToken } = await acquireLock(lockKey);
    if (!locked) return { error: `${input.environment} 环境已有发布任务进行中` };

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
      });

      // 持久化 lock_token 到任务记录（通过 source_task_id 字段复用）
      await releaseRepository.updateTaskStatus(task.task_id, 'pending', { rollback_version: lockToken });

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
          await failTask(task.task_id, result.error || 'GitHub Actions 触发失败', lockKey, lockToken);
        }
      }).catch(async (err: any) => {
        await failTask(task.task_id, err.message, lockKey, lockToken);
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

    // 解析 lock_token：部署任务直接存 lockToken，回滚任务存 "sourceTaskId:lockToken"
    const envLockKey = `${RELEASE_LOCK_PREFIX}${task.environment}`;
    let lockToken = '';
    let sourceTaskId = '';
    const rawRv = task.rollback_version || '';
    if (task.action === 'rollback' && rawRv.includes(':')) {
      const parts = rawRv.split(':');
      sourceTaskId = parts[0];
      lockToken = parts.slice(1).join(':');
    } else {
      lockToken = rawRv;
    }

    if (body.status === 'failed') {
      await releaseRepository.updateTaskStatus(body.taskId, 'failed', {
        error_message: body.message, current_stage: body.stage, progress: body.progress,
      });
      await writeLog(body.taskId, body.stage, 'error', `步骤失败: ${body.message}`);
      if (lockToken) await releaseLock(envLockKey, lockToken);
    }

    if (body.stage === 'complete' && body.status === 'success') {
      const finalStatus = task.action === 'rollback' ? 'rolled_back' : 'success';
      await releaseRepository.updateTaskStatus(body.taskId, finalStatus, { progress: 100 });
      await writeLog(body.taskId, 'complete', 'info', finalStatus === 'rolled_back' ? '回滚完成' : '发布完成');
      if (lockToken) await releaseLock(envLockKey, lockToken);

      // 回滚完成 → 通过 sourceTaskId 更新原任务
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
    const { ok: locked, token: lockToken } = await acquireLock(lockKey);
    if (!locked) return { error: `${task.environment} 环境已有发布任务进行中` };

    try {
      // 创建回滚任务，source_task_id 通过 rollback_version 字段存储
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
      });

      // 在回滚任务上存 source_task_id（复用 rollback_version 字段）
      await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'pending', {
        rollback_version: taskId, // source_task_id
      });

      // 持久化 lock_token 到回滚任务
      await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'pending', {
        rollback_version: taskId,
      });
      // 用 extra_data 存 lockToken：通过 rollback_version 的两个用途
      // 改用两步 update
      // 实际上我们已经用 rollback_version 存了 source_task_id，lockToken 需要另存
      // 简化：用 rollback_version 同时存 sourceTaskId，lockToken 用单独的字段
      // ops_release_task 没有 lock_token 字段，把 lockToken 存到 reason 的备注里或者直接不用持久化
      // 最佳方案：rollback_version 存 source_task_id，lockToken 用 from_version 存
      // 但 from_version 已经被用了。简化方案：lockToken 不持久化，回滚任务的回调从原任务取
      // 原任务已存了 lockToken（在 createRelease 时存的）

      // 重新整理：
      // 1. rollback_version 在回滚任务中存 source_task_id
      // 2. lockToken 在原任务中存（createRelease 时已存）
      // 3. 回滚任务的回调时，通过 source_task_id 找到原任务，从中取 lockToken

      // 但是回滚任务的 rollback_version 已经被设为 source_task_id 了，需要额外字段存 lockToken
      // 用 from_version 存 lockToken（from_version 已经存了 task.target_version，冲突）
      // 简化：回滚任务的 lockToken 就是 lockToken，回调时 lockToken 从 request body 中传过来不现实
      // 最终方案：把 lockToken 用特殊的 rollback_version 编码，格式: sourceTaskId:lockToken
      const encodedSource = `${taskId}:${lockToken}`;
      await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'pending', {
        rollback_version: encodedSource,
      });

      // 原任务标记 rolling_back，存 lockToken
      await releaseRepository.updateTaskStatus(taskId, 'rolling_back', {
        rollback_version: lockToken,
      });
      await writeLog(taskId, null, 'warn', `触发回滚任务 ${rollbackTask.task_id} → ${targetVersion}`);

      // 回滚任务创建步骤
      await releaseRepository.createSteps(rollbackTask.task_id, ROLLBACK_STEPS);
      await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'running');

      triggerDeployWorkflow({
        action: 'rollback',
        version: targetVersion,
        environment: task.environment,
        taskId: rollbackTask.task_id,
        services: task.services,
      }).then(async (result) => {
        if (result.runId) {
          await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'running', { github_run_id: result.runId });
          await releaseRepository.updateStepStatus(rollbackTask.task_id, 'rollback', 'success');
          await writeLog(rollbackTask.task_id, 'rollback', 'info', `runId=${result.runId}`);
        } else {
          await failRollbackAndRestore(
            rollbackTask.task_id, taskId,
            result.error || 'GitHub Actions 触发失败', lockKey, lockToken,
          );
        }
      }).catch(async (err: any) => {
        await failRollbackAndRestore(
          rollbackTask.task_id, taskId,
          err.message, lockKey, lockToken,
        );
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
