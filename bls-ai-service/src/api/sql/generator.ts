import Router from 'koa-router';
import { success } from '../../core/response';
import { ValidationError, ForbiddenError } from '../../core/errors';
import { askAI } from '../../provider/factory';
import { checkSqlSafety, injectTenantId } from './sql-guard';
import { getCurrentTenantId } from '../../core/request-context';
import { env } from '../../config/env';
import { z } from 'zod';

const router = new Router();

const generateSchema = z.object({
  description: z.string().min(1, '描述不能为空').max(2000, '描述过长'),
  tables: z.array(z.string().max(64)).optional().default([]),
});

router.post('/generate', async (ctx) => {
  const parsed = generateSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { description, tables } = parsed.data;
  const tenantId = getCurrentTenantId();

  const tableInfo = tables.length > 0
    ? `\n已知表名（请在 SQL 中仅使用这些表）: ${tables.join(', ')}`
    : '';

  const systemPrompt = `你是一个专业的 SQL 分析专家。根据用户的自然语言描述，生成只读的 SQL 查询语句。

重要规则：
1. 只允许生成 SELECT / SHOW / DESCRIBE / EXPLAIN 语句
2. 不支持 INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE 等写操作
3. 不要使用分号结束（系统会禁止多语句）
4. 不要包含注释
5. 只返回纯 SQL 语句，不要有任何解释文字
6. 如果用户描述的查询无法用 SELECT 实现，返回: UNSAFE: 原因
7. LIMIT 默认限制 1000 条

数据库使用 MySQL 8.0 语法。`;

  const userPrompt = `请将以下自然语言描述转换为只读 SQL 查询：
  
${description}${tableInfo}

只返回 SQL 语句，不要加任何解释。`;

  const rawSql = (await askAI(systemPrompt, userPrompt)).trim();

  // 检查是否为不安全的请求
  if (rawSql.startsWith('UNSAFE:')) {
    throw new ForbiddenError(`不支持的操作: ${rawSql.replace('UNSAFE:', '').trim()}`);
  }

  // SQL Guard 安全扫描
  const guardResult = checkSqlSafety(rawSql, tenantId ?? undefined);
  if (!guardResult.safe) {
    throw new ForbiddenError(`SQL 安全检查未通过: ${guardResult.reason}`);
  }

  // 租户隔离注入
  let finalSql = guardResult.sanitized || rawSql;
  if (tenantId) {
    finalSql = injectTenantId(finalSql, tenantId);
  }

  success(ctx, {
    sql: finalSql,
    original: env.isProduction ? undefined : guardResult.sanitized,
    tenantIsolated: !!tenantId,
  }, 'SQL 生成成功');
});

export default router;
