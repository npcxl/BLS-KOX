/**
 * SQL 错误审计
 *
 * 记录所有执行报错的 SQL 语句及其错误信息，用于排查数据库问题。
 * 采用 fire-and-forget 方式落库，不阻塞主业务流程。
 */

import { pool } from './database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { getRequestContext } from './request-context';

/** 从错误对象中提取 MySQL 错误编号 */
function extractErrorNumber(err: unknown): number | null {
  const anyErr = err as any;
  if (anyErr && typeof anyErr === 'object') {
    const code = anyErr.errno ?? anyErr.sqlState;
    if (typeof code === 'number') return code;
    if (typeof code === 'string' && /^\d+$/.test(code)) return Number(code);
  }
  return null;
}

/** 从错误对象中提取错误码字符串 */
function extractErrorCode(err: unknown): string | null {
  const anyErr = err as any;
  if (!anyErr || typeof anyErr !== 'object') return null;
  if (typeof anyErr.code === 'string') return anyErr.code;
  if (typeof anyErr.sqlState === 'string') return anyErr.sqlState;
  return null;
}

/**
 * 记录一条 SQL 错误审计（fire-and-forget，不阻塞主流程）。
 *
 * @param operation 操作类型（query / query_one / execute / transaction）
 * @param sql 报错的 SQL 语句
 * @param error 捕获到的错误对象
 */
export function writeSqlError(operation: string, sql: string, error: unknown): void {
  // 审计落库失败不影响主业务，静默忽略
  void (async () => {
    try {
      const ctx = getRequestContext();
      const errMsg = error instanceof Error ? error.message : String(error ?? '');

      // 直接使用底层 pool 插入，绕过 execute 的审计钩子，避免「审计失败→再审计」的递归
      await pool.execute(
        `INSERT INTO sys_sql_audit (
          audit_id, tenant_id, user_id, username, operation, sql_text,
          error_code, error_number, error_message, client_ip, user_agent, request_id
        ) VALUES (
          :auditId, :tenantId, :userId, :username, :operation, :sqlText,
          :errorCode, :errorNumber, :errorMessage, :clientIp, :userAgent, :requestId
        )`,
        {
          auditId: generateSnowflakeId(),
          tenantId: ctx?.tenantId ?? '000000',
          userId: ctx?.userId ?? null,
          username: ctx?.username ?? null,
          operation,
          sqlText: sql.slice(0, 10000), // 截断过长 SQL，防止超限
          errorCode: extractErrorCode(error),
          errorNumber: extractErrorNumber(error),
          errorMessage: errMsg.slice(0, 2000),
          clientIp: ctx?.clientIp ?? null,
          userAgent: ctx?.userAgent ?? null,
          requestId: ctx?.requestId ?? null,
        },
      );
    } catch (_) {
      // 审计本身失败（例如表不存在、连接断开）时静默忽略，避免递归/雪崩
    }
  })();
}
