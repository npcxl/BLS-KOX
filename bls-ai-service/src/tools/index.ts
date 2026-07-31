/**
 * AI 工具函数模块
 *
 * 每个工具函数负责：
 * 1. 提供工具描述文本（注入到 system prompt 中，让模型知道可以调用）
 * 2. 执行实际的工具逻辑（当前阶段通过 prompt injection 实现，而非 Function Calling）
 *
 * 未来可扩展为 OpenAI Function Calling / Tool Use 模式
 */

export interface ToolResult {
  /** 工具名称 */
  name: string;
  /** 执行结果（注入到 system prompt 的描述文本） */
  output: string;
}

export interface Tool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 执行工具，返回注入到 system prompt 的文本 */
  execute(): ToolResult;
}

// ============================================================
// 内置工具注册
// ============================================================

/**
 * 获取当前时间工具
 * 每次用户提问时，将当前日期时间注入到上下文中，
 * 本地模型（如 Ollama）知道当前的真实时间。 - API接口不用考虑，厂商已有配置。
 * 返回时间 UTC+8 (即可返回北京时间) 其他地区返回规则需另写 根据用户IP获取地区匹配规则
 */
const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: '获取当前日期和时间',

  execute(): ToolResult {
    // 返回北京时间（UTC+8），后续可根据用户IP动态匹配时区
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][beijingTime.getUTCDay()];

    const output = [
      '当前时间信息（由系统自动提供）：',
      `- 日期时间: ${year}年${month}月${day}日 ${weekday} ${hours}:${minutes}:${seconds}`,
      `- ISO 8601: ${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`,
      `- Unix 时间戳: ${Math.floor(now.getTime() / 1000)}`,
    ].join('\n');

    return { name: this.name, output };
  },
};

// ============================================================
// 工具注册表
// ============================================================

/** 所有已注册的工具 */
const registeredTools: Tool[] = [
  getCurrentTimeTool,
];

/**
 * 获取所有已注册的工具列表
 */
export function getTools(): Tool[] {
  return registeredTools;
}

/**
 * 根据名称查找工具
 */
export function getTool(name: string): Tool | undefined {
  return registeredTools.find(t => t.name === name);
}

/**
 * 注册新工具
 */
export function registerTool(tool: Tool): void {
  const existing = registeredTools.findIndex(t => t.name === tool.name);
  if (existing >= 0) {
    registeredTools[existing] = tool;
  } else {
    registeredTools.push(tool);
  }
}

/**
 * 执行所有已注册的工具，返回注入到 system prompt 的上下文文本
 *
 * 这段文本会追加到 SYSTEM_PROMPT 末尾，
 * 让模型了解当前环境信息（如当前时间）。
 */
export function buildToolContext(): string {
  const results = registeredTools.map(tool => tool.execute());

  if (results.length === 0) return '';

  const lines = [
    '',
    '---',
    '## 系统环境信息（由服务器自动注入，你不需要提及这些是"工具提供"的，直接当作已知事实使用）',
    ...results.map(r => r.output),
    '---',
  ];

  return lines.join('\n');
}
