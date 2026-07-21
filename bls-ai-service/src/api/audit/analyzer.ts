import Router from 'koa-router';
import { success } from '../../core/response';
import { ValidationError } from '../../core/errors';
import { askAI } from '../../provider/factory';
import { z } from 'zod';

const router = new Router();

const analyzeSchema = z.object({
  logType: z.enum(['login', 'api_access', 'rate_limit', 'error', 'all']).default('all'),
  timeRange: z.string().optional(),
  logData: z.string().min(1, '日志数据不能为空').max(10000, '日志数据过长'),
});

function parseAiJson(raw: string): any {
  const trimmed = raw.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = codeBlock ? codeBlock[1].trim() : trimmed;
  return JSON.parse(json);
}

router.post('/analyze', async (ctx) => {
  const parsed = analyzeSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { logType, timeRange, logData } = parsed.data;

  const systemPrompt = `你是一个资深的系统安全审计专家。分析用户提供的日志数据，识别安全风险。

返回严格的 JSON 格式（不要包含 markdown 标记），结构如下：
{
  "riskLevel": "high" | "medium" | "low" | "none",
  "summary": "总体风险评估（1-2句话）",
  "findings": [
    {
      "type": "问题类型（login_failure/api_abuse/rate_limit/error_spike/suspicious_ip/other）",
      "severity": "high" | "medium" | "low",
      "description": "问题描述",
      "evidence": "证据/日志片段",
      "recommendation": "建议应对措施"
    }
  ],
  "statistics": {
    "totalEvents": 数字,
    "uniqueIps": 数字,
    "topEventType": "最频繁的事件类型"
  }
}

分析维度：
- 登录失败：检查暴力破解迹象（同一 IP 多次失败）
- 接口访问：检查异常频率、非工作时间访问
- 限流触发：频次、时间分布
- 异常日志：错误级别、错误模式、是否有注入/攻击特征
- IP 地理分布：是否来自异常地区`;

  const timeInfo = timeRange ? `\n时间范围: ${timeRange}` : '';
  const userPrompt = `分析以下${logType === 'all' ? '综合' : logType}日志数据：${timeInfo}
  
日志内容：
${logData}

返回纯 JSON，不要用 markdown 代码块包裹。`;

  const result = await askAI(systemPrompt, userPrompt, { jsonMode: true });
  const data = parseAiJson(result);

  success(ctx, data, '日志分析完成');
});

export default router;
