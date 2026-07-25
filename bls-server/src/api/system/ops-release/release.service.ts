import { releaseRepository } from './release.repository';
import { triggerDeployWorkflow, fetchGitHubTags } from './github-actions.service';
import { getRedisClient } from '../../../../shared/utils/redis';
import { logger } from '../../../../core/logger';
import { generateSnowflakeId } from '../../../../shared/utils/snowflake';
import { sendToChannel } from './release.ws';
import {
  RELEASE_STEPS,
  ROLLBACK_STEPS,
  RELEASE_LOCK_PREFIX,
  VERSION_LIST_CACHE_KEY,
  VERSION_CACHE_TTL,
} from './release.constants';
import type {
  CreateReleaseRequest,
  TaskStatus,
  StepStatus,
  StepKey,
} from './release.types';

async function writeLog(taskId: string, stepKey: string | null, level: string, message: string): Promise<void> {
  try { await releaseRepository.appendLog(taskId, stepKey, level, message); } catch { /* ignore */ }
}

export const releaseService = {
  /**
   * 创建发布任务
   */
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
      // 降级：也接受 GitHub Tags 中存在的版本（但标记为 unverified）
      const ghTags = await fetchGitHubTags();
      if (!ghTags.includes(input.version)) {
        return { error: `版本 ${input.version} 不存在或尚未构建完成` };
      }
    }

    // 2. 获取分布式锁
    const lockKey = `${RELEASE_LOCK_PREFIX}${input.environment}`;
    const lockValue = generateSnowflakeId();
    const redis = await getRedisClient();

    if (redis) {
      const locked = await redis.set(lockKey, lockValue, 'NX', 'PX', 600_000);
      if (!locked) {
        return { error: `${input.environment} 环境已有发布任务进行中，请稍后再试` };
      }
    }

    // 3. 检查是否有进行中的任务
    const running = await releaseRepository.findRunningTask(input.environment, tenantId);
    if (running) {
      await redis?.del(lockKey);
      return { error: `${input.environment} 环境已有发布任务 ${running.task_id} (状态: ${running.status})` };
    }

    // 4. 获取上一版本
    const fromVersion = await releaseRepository.getLastSuccessfulVersion(input.environment, tenantId);

    try {
      // 5. 创建任务
      const task = await releaseRepository.createTask({
        tenantId,
        environment: input.environment,
        action: 'deploy',
        fromVersion,
        targetVersion: input.version,
        services: input.services.join(','),
        reason: input.reason,
        triggeredBy,
        triggeredByName,
      });

      await writeLog(task.task_id, null, 'info', `发布任务创建: ${input.environment} → ${input.version}`);

      // 6. 创建步骤
      await releaseRepository.createSteps(task.task_id, RELEASE_STEPS);

      // 7. 更新状态
      await releaseRepository.updateTaskStatus(task.task_id, 'checking');

      // 8. 更新 validate 步骤
      await releaseRepository.updateStepStatus(task.task_id, 'validate', 'success', { message: '参数校验通过' });
      await writeLog(task.task_id, 'validate', 'info', '参数校验通过');

      // 9. 异步触发 GitHub Actions
      triggerDeployWorkflow({
        version: input.version,
        environment: input.environment,
        taskId: task.task_id,
        services: input.services.join(','),
      }).then(async (result) => {
        if (result.runId) {
          await releaseRepository.updateTaskStatus(task.task_id, 'running', { github_run_id: result.runId });
          await releaseRepository.updateStepStatus(task.task_id, 'lock', 'success', { message: '获取发布锁成功' });
          await writeLog(task.task_id, 'lock', 'info', `GitHub Actions 已触发, runId=${result.runId}`);
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

  /**
   * 处理回调
   */
  async handleCallback(body: {
    taskId: string;
    stage: StepKey;
    status: StepStatus;
    progress: number;
    message: string;
  }) {
    const task = await releaseRepository.getTaskById(body.taskId);
    if (!task) return { error: `任务 ${body.taskId} 不存在` };

    // 更新步骤
    await releaseRepository.updateStepStatus(body.taskId, body.stage, body.status, {
      progress: body.progress,
      message: body.message,
    });

    // 写入日志
    await writeLog(body.taskId, body.stage, body.status === 'failed' ? 'error' : 'info', body.message);

    // 更新任务进度
    await releaseRepository.updateTaskStatus(body.taskId, task.status, {
      current_stage: body.stage,
      progress: body.progress,
    });

    // WebSocket 推送
    sendToChannel(body.taskId, {
      type: 'release_progress', taskId: body.taskId,
      status: task.status, stage: body.stage,
      progress: body.progress, message: body.message,
      timestamp: new Date().toISOString(),
    });

    // 步骤失败
    if (body.status === 'failed') {
      await releaseRepository.updateTaskStatus(body.taskId, 'failed', {
        error_message: body.message,
        current_stage: body.stage,
        progress: body.progress,
      });
      await writeLog(body.taskId, body.stage, 'error', `步骤失败: ${body.message}`);
      sendToChannel(body.taskId, {
        type: 'release_progress', taskId: body.taskId,
        status: 'failed', stage: body.stage, progress: body.progress,
        message: `失败: ${body.message}`, timestamp: new Date().toISOString(),
      });
    }

    // complete 成功
    if (body.stage === 'complete' && body.status === 'success') {
      await releaseRepository.updateTaskStatus(body.taskId, 'success', { progress: 100 });
      await writeLog(body.taskId, 'complete', 'info', '发布完成');

      const lockKey = `${RELEASE_LOCK_PREFIX}${task.environment}`;
      const redis = await getRedisClient();
      await redis?.del(lockKey);

      sendToChannel(body.taskId, {
        type: 'release_progress', taskId: body.taskId,
        status: 'success', stage: 'complete', progress: 100,
        message: '发布完成 ✅', timestamp: new Date().toISOString(),
      });
    }

    return { taskId: body.taskId };
  },

  /**
   * 手动回滚
   */
  async rollback(taskId: string, tenantId: string) {
    const task = await releaseRepository.getTaskById(taskId);
    if (!task) return { error: '任务不存在' };
    if (task.status !== 'failed') return { error: `只有失败的任务才能回滚，当前状态: ${task.status}` };

    const targetVersion = task.from_version || task.rollback_version;
    if (!targetVersion) return { error: '无可用回滚版本' };

    await releaseRepository.updateTaskStatus(taskId, 'rolling_back');
    await writeLog(taskId, null, 'warn', `开始回滚到 ${targetVersion}`);

    await releaseRepository.createSteps(taskId, ROLLBACK_STEPS);

    triggerDeployWorkflow({
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

  /**
   * 获取可发布版本（优先数据库构建记录，降级 GitHub Tags）
   */
  async getDeployableVersions() {
    // 1. 先从数据库构建记录获取
    const built = await releaseRepository.getBuiltVersions();
    if (built.length > 0) return built;

    // 2. 降级：从 GitHub Tags 获取
    const redis = await getRedisClient();
    if (redis) {
      const cached = await redis.get(VERSION_LIST_CACHE_KEY);
      if (cached) {
        try { return JSON.parse(cached); } catch { /* fallthrough */ }
      }
    }

    const tags = await fetchGitHubTags();
    const versions = tags.map(v => ({
      version: v,
      commitHash: '',
      builtAt: '',
      available: true,
    }));

    if (redis) {
      await redis.set(VERSION_LIST_CACHE_KEY, JSON.stringify(versions), 'PX', VERSION_CACHE_TTL);
    }

    return versions;
  },
};
