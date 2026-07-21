import Router from 'koa-router';
import { success } from '../../core/response';
import { ValidationError } from '../../core/errors';
import { askAI } from '../../provider/factory';
import { z } from 'zod';

const router = new Router();

const reviewSchema = z.object({
  configType: z.enum(['env', 'docker', 'yml', 'all']).default('all'),
  configContent: z.string().min(1, '配置内容不能为空').max(20000, '配置内容过长'),
});

function parseAiJson(raw: string): any {
  const trimmed = raw.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = codeBlock ? codeBlock[1].trim() : trimmed;
  return JSON.parse(json);
}

router.post('/review', async (ctx) => {
  const parsed = reviewSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { configType, configContent } = parsed.data;

  const systemPrompt = `你是一个资深的安全配置审计专家。审查用户提供的配置文件，识别安全问题。

返回严格的 JSON 格式（不要包含 markdown 标记），结构如下：
{
  "overallRisk": "high" | "medium" | "low" | "safe",
  "summary": "总体安全评估（1-2句话）",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "分类（weak_password/default_secret/public_redis/root_database/unsafe_cors/insecure_protocol/missing_encryption/exposed_port/other）",
      "title": "问题标题",
      "location": "问题所在位置（行号或键名）",
      "current": "当前配置值（脱敏后）",
      "risk": "风险说明",
      "fix": "修复建议"
    }
  ],
  "bestPractices": ["建议1", "建议2"],
  "complianceScore": 0-100 分
}

检查重点：
- 弱密码/默认密码: 123456, password, admin, root 等
- 默认密钥/Token: CHANGE_TO_, placeholder, test_secret
- 公网暴露: 0.0.0.0 绑定非必要、公网 Redis 无密码
- root 账户: 数据库使用 root 账号
- CORS 宽松: 使用 * 通配符
- 明文协议: HTTP 而非 HTTPS
- 端口暴露: 不必要的端口映射
- 安全头: 缺少安全相关配置`;

  const userPrompt = `请审查以下${configType === 'all' ? '' : configType + ' '}配置文件的安全性：
  
${configContent}

返回纯 JSON，不要用 markdown 代码块包裹。`;

  const result = await askAI(systemPrompt, userPrompt, { jsonMode: true });
  const data = parseAiJson(result);

  success(ctx, data, '配置审查完成');
});

export default router;
