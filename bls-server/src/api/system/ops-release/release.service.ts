import { releaseRepository } from './release.repository';
import { triggerDeployWorkflow } from './github-actions.service';
import { getRedisClient } from '../../../shared/utils/redis';
import { logger } from '../../../core/logger';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { sendToChannel } from './release.ws';
import {
  RELEASE_STEPS, ROLLBACK_STEPS,
  RELEASE_LOCK_PREFIX, VERSION_LIST_CACHE_KEY, VERSION_CACHE_TTL,
} from './release.constants';
import type { CreateReleaseRequest, StepStatus, StepKey } from './release.types';

async function releaseLock(lockKey: string) {
  const redis = await getRedisClient();
  if (redis) {
    const ok = await redis.set(lockKey, generateSnowflakeId(), 'PX', 600_000, 'NX');
    return ok === 'OK';
  }
  return true; // Redis 不可用时降级放行
}

async function releaseUnlock(lockKey: string) {
  const redis = await getRedisClient();
  try { await redis?.del(lockKey); } catch { /* ignore */ }
}

async function writeLog(taskId: string, stepKey: string | null, level: string, message: string): Promise<void> {
  try { await releaseRepository.appendLog(taskId, stepKey, level, message); } catch { /* ignore */ }
}

export const releaseService = {
  async createRelease(
    input: CreateReleaseRequest,
    tenantId: string,
    triggeredBy: string,
    triggeredByName: string | null,
  ) {
    // 1. 检查版本是否已构建 — 只允许 ops_release_version.status=built
    const builtVersions = await releaseRepository.getBuiltVersions();
    if (!builtVersions.find(v => v.version === input.version)) {
      return { error: `版本 ${input.version} 尚未构建完成，请先推送 Tag 触发镜像构建` };
    }

    // 2. 分布式锁
    const lockKey = `${RELEASE_LOCK_PREFIX}${input.environment}`;
    if (!(await releaseLock(lockKey))) {
      return { error: `${input.environment} 环境已有发布任务进行中` };
    }

    // 3. 检查进行中任务
    const running = await releaseRepository.findRunningTask(input.environment, tenantId);
    if (running) { await releaseUnlock(lockKey); return { error: `已有进行中任务 ${running.task_id}` }; }

    // 4. 上一版本
    const lastTask = await releaseRepository.getLastSuccessfulVersion(input.environment, tenantId);
    const fromVersion = lastTask?.target_version || null;

    try {
      const servicesStr = input.services.join(' ');
      const task = await releaseRepository.createTask({
        tenantId, environment: input.environment, action: 'deploy',
        fromVersion, targetVersion: input.version, services: servicesStr,
        reason: input.reason, triggeredBy, triggeredByName,
      });

      await writeLog(task.task_id, null, 'info', `发布任务创建: ${input.environment} → ${input.version}`);
      await releaseRepository.createSteps(task.task_id, RELEASE_STEPS);
      await releaseRepository.updateTaskStatus(task.task_id, 'checking');
      await releaseRepository.updateStepStatus(task.task_id, 'validate', 'success', { message: '参数校验通过' });
      await writeLog(task.task_id, 'validate', 'info', '参数校验通过');

      triggerDeployWorkflow({
        action: 'deploy',
        version: input.version,
        environment: input.environment,
        taskId: task.task_id,
        services: servicesStr,
      }).then(async (result) => {
        if (result.runId) {
          await releaseRepository.updateTaskStatus(task.task_id, 'running', { github_run_id: result.runId });
          await releaseRepository.updateStepStatus(task.task_id, 'lock', 'success', { message: 'GitHub Actions 已触发' });
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
          await releaseUnlock(lockKey);
        }
      }).catch(async (err: any) => {
        await releaseRepository.updateTaskStatus(task.task_id, 'failed', { error_message: err.message });
        await releaseRepository.failAllRunningSteps(task.task_id);
        await writeLog(task.task_id, null, 'error', `异常: ${err.message}`);
        await releaseUnlock(lockKey);
      });

      return { task };
    } catch (err: any) {
      await releaseUnlock(lockKey);
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

    if (body.status === 'failed') {
      await releaseRepository.updateTaskStatus(body.taskId, 'failed', {
        error_message: body.message, current_stage: body.stage, progress: body.progress,
      });
      await writeLog(body.taskId, body.stage, 'error', `步骤失败: ${body.message}`);
      await releaseUnlock(`${RELEASE_LOCK_PREFIX}${task.environment}`);
    }

    if (body.stage === 'complete' && body.status === 'success') {
      const finalStatus = task.action === 'rollback' ? 'rolled_back' : 'success';
      await releaseRepository.updateTaskStatus(body.taskId, finalStatus, { progress: 100 });
      await writeLog(body.taskId, 'complete', 'info', finalStatus === 'rolled_back' ? '回滚完成' : '发布完成');
      await releaseUnlock(`${RELEASE_LOCK_PREFIX}${task.environment}`);
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

    // 创建独立的回滚任务
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

    // 原任务标记为 rolling_back
    await releaseRepository.updateTaskStatus(taskId, 'rolling_back');
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
    }).catch(async (err: any) => {
      await releaseRepository.updateTaskStatus(rollbackTask.task_id, 'failed', { error_message: err.message });
      await writeLog(rollbackTask.task_id, null, 'error', `回滚失败: ${err.message}`);
    });

    return { taskId: rollbackTask.task_id, targetVersion };
  },

  async getDeployableVersions() {
    // 只从 ops_release_version 获取，不降级 Git Tag
    return releaseRepository.getBuiltVersions();
  },
};
