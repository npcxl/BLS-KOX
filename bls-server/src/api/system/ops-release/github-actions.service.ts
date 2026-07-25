import { logger } from '../../../core/logger';

const GITHUB_API = 'https://api.github.com';

interface GitHubConfig {
  owner: string;
  repo: string;
  deployWorkflow: string;
  deployRef: string;
  token: string;
  callbackUrl: string;
  callbackSecret: string;
}

let _config: GitHubConfig | null = null;

function getConfig(): GitHubConfig {
  if (!_config) {
    _config = {
      owner: process.env.GITHUB_OWNER || 'npcxl',
      repo: process.env.GITHUB_REPO || 'BLS-KOX',
      deployWorkflow: process.env.GITHUB_DEPLOY_WORKFLOW || 'deploy-production.yml',
      deployRef: process.env.GITHUB_DEPLOY_REF || 'master',
      token: process.env.GITHUB_DEPLOY_TOKEN || '',
      callbackUrl: process.env.RELEASE_CALLBACK_URL || '',
      callbackSecret: process.env.RELEASE_CALLBACK_SECRET || '',
    };
  }
  return _config;
}

/** 调用 GitHub Actions workflow_dispatch */
export async function triggerDeployWorkflow(params: {
  action: string;
  version: string;
  environment: string;
  taskId: string;
  services: string;
}): Promise<{ runId: string | null; error?: string }> {
  const cfg = getConfig();

  if (!cfg.token) {
    return { runId: null, error: 'GITHUB_DEPLOY_TOKEN 未配置' };
  }

  const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.deployWorkflow}/dispatches`;

  const body = {
    ref: cfg.deployRef,
    inputs: {
      action: params.action,
      version: params.version,
      environment: params.environment,
      taskId: params.taskId,
      services: params.services,
      callbackUrl: cfg.callbackUrl,
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error('[GitHubActions] workflow_dispatch 失败', { status: res.status, error: errText });
      return { runId: null, error: `GitHub API 返回 ${res.status}: ${errText.slice(0, 200)}` };
    }

    logger.info('[GitHubActions] workflow_dispatch 成功', { taskId: params.taskId, version: params.version });

    // workflow_dispatch 不直接返回 runId，需要异步查询
    // 短暂等待后获取最新的 run
    await new Promise(r => setTimeout(r, 3000));
    const runId = await findLatestRun(cfg);

    return { runId };
  } catch (err: any) {
    logger.error('[GitHubActions] 调用异常', { error: err.message });
    return { runId: null, error: err.message };
  }
}

/** 查找最新的 workflow run */
async function findLatestRun(cfg: GitHubConfig): Promise<string | null> {
  try {
    const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.deployWorkflow}/runs?per_page=1`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) return null;

    const json: any = await res.json();
    const run = json.workflow_runs?.[0];
    return run ? String(run.id) : null;
  } catch {
    return null;
  }
}

/** 查询 workflow run 状态 */
export async function getWorkflowRunStatus(runId: string): Promise<{ status: string; conclusion: string | null } | null> {
  const cfg = getConfig();
  if (!cfg.token) return null;

  try {
    const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/actions/runs/${runId}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) return null;

    const json: any = await res.json();
    return { status: json.status || 'unknown', conclusion: json.conclusion || null };
  } catch {
    return null;
  }
}

/** 获取仓库 Tags（用于版本列表） */
export async function fetchGitHubTags(): Promise<string[]> {
  const cfg = getConfig();
  if (!cfg.token) return [];

  try {
    const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/git/refs/tags?per_page=50`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) return [];

    const json: any = await res.json();
    return (json || [])
      .map((ref: any) => (ref.ref || '').replace('refs/tags/v', '').replace('refs/tags/', ''))
      .filter((v: string) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a: string, b: string) => {
        const [a1, a2, a3] = a.split('.').map(Number);
        const [b1, b2, b3] = b.split('.').map(Number);
        return b1 - a1 || b2 - a2 || b3 - a3;
      });
  } catch {
    return [];
  }
}
