import Router from 'koa-router';
import { success } from '../../core/response';
import { ValidationError } from '../../core/errors';
import { askAI } from '../../provider/factory';
import { z } from 'zod';

const router = new Router();

const generateSchema = z.object({
  description: z.string().min(1, '描述不能为空').max(2000, '描述过长'),
  tableName: z.string().min(1, '表名不能为空').max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, '表名格式不合法'),
  tenantIsolation: z.boolean().default(true),
});

/** 解析 AI 返回的 JSON（兼容 markdown 代码块包裹） */
function parseAiJson(raw: string): any {
  const trimmed = raw.trim();
  // 处理 ```json ... ``` 包裹的情况
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = codeBlock ? codeBlock[1].trim() : trimmed;
  return JSON.parse(json);
}

router.post('/generate', async (ctx) => {
  const parsed = generateSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { description, tableName, tenantIsolation } = parsed.data;

  const systemPrompt = `你是一个专业的后端开发专家。根据用户的描述生成 CRUD 配置。

返回严格的 JSON 格式（不要包含 markdown 标记），结构如下：
{
  "tableName": "表名",
  "sql": "CREATE TABLE 建表 SQL（包含索引）",
  "crudConfig": {
    "columns": [{ "field": "字段名", "label": "显示名", "type": "类型(text/number/date/select/textarea)", "required": true/false, "searchable": true/false, "sortable": true/false }],
    "enablePagination": true,
    "enableExport": true
  },
  "menuSuggestion": { "name": "菜单名称", "icon": "建议图标", "parentPath": "父级路由" },
  "permissionCodes": ["权限码1", "权限码2"],
  "dynamicColumns": { "list": [...], "form": [...], "detail": [...] }
}

类型映射规则：
- 文本字段 -> text
- 数字字段 -> number
- 时间/日期字段 -> date
- 下拉/枚举字段 -> select
- 长文本/富文本 -> textarea

${tenantIsolation ? '必须包含 tenant_id 字段（BIGINT NOT NULL），所有查询必须带 WHERE tenant_id = ?' : ''}`;

  const userPrompt = `请根据以下描述生成 CRUD 配置：
  
表名: ${tableName}
描述: ${description}

返回纯 JSON，不要用 markdown 代码块包裹。`;

  const result = await askAI(systemPrompt, userPrompt, { jsonMode: true });
  const data = parseAiJson(result);

  success(ctx, data, 'CRUD 配置生成成功');
});

export default router;
