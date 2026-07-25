import { releaseRepository } from './release.repository';
import { triggerDeployWorkflow, fetchGitHubTags } from './github-actions.service';
import { getRedisClient } from '../../../shared/utils/redis';
import { logger } from '../../../core/logger';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { sendToChannel } from './release.ws';
import {
  RELEASE_STEPS, ROLLBACK_STEPS,
  RELEASE_LOCK_PREFIX, VERSION_LIST_CACHE_KEY, VERSION_CACHE_TTL,
} from './release.constants';
import type { CreateReleaseRequest, StepStatus, StepKey } from './release.types';

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
    // 1. 检查版本是否已构建
    const builtVersions = await releaseRepository.getBuiltVersions();
    const builtVersion = builtVersions.find(v => v.version === input.version);
    if (!builtVersion) {
      const ghTags = await fetchGitHubTags();
      if (!ghTags.includes(input.version)) {
        return { error: `版本 ${input.version} 不存在或尚未构建完成` };
      }
    }

    // 2. 分布式锁
    const lockKey = `${RELEASE_LOCK_PREFIX}${input.environment}`;
    const lockValue = generateSnowflakeId();
    const redis = await getRedisClient();
    if (redis) {
      const locked = await redis.set(lockKey, lockValue, 'PX', 600_000, 'NX');
      if (!locked) return { error: `${input.environment} 环境已有发布任务进行中` };
    }

    // 3. 检查进行中任务
    const running = await releaseRepository.findRunningTask(input.environment, tenantId);
    if (running) { await redis?.del(lockKey); return { error: `已有进行中任务 ${running.task_id}` }; }

    // 4. 上一版本
    const lastTask = await releaseRepository.getLastSuccessfulVersion(input.environment, tenantId);
    const fromVersion = lastTask?.target_version || null;

    try {
      // 5. 创建任务 — services 用空格分隔
      const servicesStr = input.services.join(' ');
      const task = await releaseRepository.createTask({
        tenantId, environment: input.environment, action: 'deploy',
        fromVersion, targetVersion: input.version, services: servicesStr,
        reason: input.reason, triggeredBy, triggeredByName,
      });

      await writeLog(task.task_id, null, 'info', `发布任务创建: ${input.environment} → ${input.version}`);

      // 6. 创建步骤
      await releaseRepository.createSteps(task.task_id, RELEASE_STEPS);
      await releaseRepository.updateTaskStatus(task.task_id, 'checking');
      await releaseRepository.updateStepStatus(task.task_id, 'validate', 'success', { message: '参数校验通过' });
      await writeLog(task.task_id, 'validate', 'info', '参数校验通过');

      // 7. 异步触发 GitHub Actions（传 action=deploy）
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
          await redis?.del(lockKey);
        }
      }).catch(async (err: any) => {
        await releaseRepository.updateTaskStatus(task.task_id, 'failed', { error_message: err.message });
        await releaseRepository.failAllRunningSteps(task.task_id);
        await writeLog(task.task_id, null, 'error', `异常: ${err.message}`);
        await redis?.del(lockKey);
      });

      return { task };
    } catch (err: any) {
      await redis?.del(lockKey);
      throw err;
    }
  },

  async handleCallback(body: { taskId: string; stage: StepKey; status: StepStatus; progress: number; message: string }) {
    const task = await releaseRepository.getTaskByIdInternal(body.taskId);
    if (!task) return { error: `任务 ${body.taskId} 不存在` };

    // 状态校验：只有 running 状态的任务才能接受回调
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
    }

    if (body.stage === 'complete' && body.status === 'success') {
      // 回滚任务完成 → rolled_back，部署任务完成 → success
      const finalStatus = task.action === 'rollback' ? 'rolled_back' : 'success';
      await releaseRepository.updateTaskStatus(body.taskId, finalStatus, { progress: 100 });
      await writeLog(body.taskId, 'complete', 'info', '发布完成');
      const lockKey = `${RELEASE_LOCK_PREFIX}${task.environment}`;
      const redis = await getRedisClient();
      await redis?.del(lockKey);
      sendToChannel(body.taskId, {
        type: 'release_progress', taskId: body.taskId,
        status: 'success', stage: 'complete', progress: 100,
        message: '发布完成', timestamp: new Date().toISOString(),
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

    await releaseRepository.updateTaskStatus(taskId, 'rolling_back');
    await writeLog(taskId, null, 'warn', `开始回滚到 ${targetVersion}`);
    await releaseRepository.createSteps(taskId, ROLLBACK_STEPS);

    // 回滚时传 action=rollback
    triggerDeployWorkflow({
      action: 'rollback',
      version: targetVersion,
      environment: task.environment,
      taskId,
      services: task.services,
    }).catch(async (err: any) => {
      await releaseRepository.updateTaskStatus(taskId, 'failed', { error_message: `回滚失败: ${err.message}` });
      await writeLog(taskId, null, 'error', `回滚失败: ${err.message}`);
    });

    return { taskId, targetVersion };
  },

  async getDeployableVersions() {
    const built = await releaseRepository.getBuiltVersions();
    if (built.length > 0) return built;

    const redis = await getRedisClient();
    if (redis) {
      const cached = await redis.get(VERSION_LIST_CACHE_KEY);
      if (cached) { try { return JSON.parse(cached); } catch { /* fallthrough */ } }
    }

    const tags = await fetchGitHubTags();
    const versions = tags.map(v => ({ version: v, commitHash: '', builtAt: '', available: true }));
    if (redis) await redis.set(VERSION_LIST_CACHE_KEY, JSON.stringify(versions), 'EX', Math.ceil(VERSION_CACHE_TTL / 1000));
    return versions;
  },
};
