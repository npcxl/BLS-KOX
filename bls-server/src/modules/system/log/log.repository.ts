import { query, queryOne } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition } from '../../../core/sql';
import { getPageParams, PageParams } from '../../../shared/utils/pagination';
import { LoginLogQuery, OperationLogQuery, UploadAuditQuery } from './log.model';

export class LogRepository {
  async listLoginLogs(filters: LoginLogQuery, page: PageParams = getPageParams(filters)) {
    const where = joinConditions([
      likeCondition('username', 'username', filters.username),
      eqCondition('tenant_id', 'tenantId', filters.tenantId),
      eqCondition('login_status', 'loginStatus', filters.loginStatus),
      eqCondition('login_type', 'loginType', filters.loginType),
      likeCondition('login_ip', 'loginIp', filters.loginIp),
      { sql: '1 = 1', params: {} },
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize, startTime: filters.startTime ?? null, endTime: filters.endTime ?? null };
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(1) AS total FROM sys_login_log WHERE 1 = 1
        AND (:username IS NULL OR username LIKE CONCAT('%', :username, '%'))
        AND (:tenantId IS NULL OR tenant_id = :tenantId)
        AND (:loginStatus IS NULL OR login_status = :loginStatus)
        AND (:loginType IS NULL OR login_type = :loginType)
        AND (:loginIp IS NULL OR login_ip LIKE CONCAT('%', :loginIp, '%'))
        AND (:startTime IS NULL OR login_time >= :startTime)
        AND (:endTime IS NULL OR login_time <= :endTime)`,
      params,
    );
    const rows = await query(
      `SELECT log_id AS logId, tenant_id AS tenantId, user_id AS userId, username, login_type AS loginType,
              login_status AS loginStatus, fail_reason AS failReason, login_ip AS loginIp,
              user_agent AS userAgent, request_id AS requestId, login_time AS loginTime
       FROM sys_login_log
       WHERE 1 = 1
        AND (:username IS NULL OR username LIKE CONCAT('%', :username, '%'))
        AND (:tenantId IS NULL OR tenant_id = :tenantId)
        AND (:loginStatus IS NULL OR login_status = :loginStatus)
        AND (:loginType IS NULL OR login_type = :loginType)
        AND (:loginIp IS NULL OR login_ip LIKE CONCAT('%', :loginIp, '%'))
        AND (:startTime IS NULL OR login_time >= :startTime)
        AND (:endTime IS NULL OR login_time <= :endTime)
       ORDER BY login_time DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    return { rows, total: totalRow?.total ?? 0 };
  }

  async listOperationLogs(filters: OperationLogQuery, page: PageParams = getPageParams(filters)) {
    const params = { ...filters, offset: page.offset, pageSize: page.pageSize };
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(1) AS total FROM sys_operation_log WHERE 1 = 1
        AND (:username IS NULL OR username LIKE CONCAT('%', :username, '%'))
        AND (:tenantId IS NULL OR tenant_id = :tenantId)
        AND (:moduleName IS NULL OR module_name LIKE CONCAT('%', :moduleName, '%'))
        AND (:businessType IS NULL OR business_type = :businessType)
        AND (:success IS NULL OR success = :success)
        AND (:clientIp IS NULL OR client_ip LIKE CONCAT('%', :clientIp, '%'))
        AND (:requestId IS NULL OR request_id LIKE CONCAT('%', :requestId, '%'))
        AND (:startTime IS NULL OR operator_time >= :startTime)
        AND (:endTime IS NULL OR operator_time <= :endTime)`,
      params,
    );
    const rows = await query(
      `SELECT log_id AS logId, tenant_id AS tenantId, user_id AS userId, username, module_name AS moduleName,
              business_type AS businessType, title, request_method AS requestMethod, request_url AS requestUrl,
              request_params AS requestParams, response_status AS responseStatus, success, error_message AS errorMessage,
              error_stack AS errorStack, client_ip AS clientIp, user_agent AS userAgent, request_id AS requestId,
              cost_time_ms AS costTimeMs, remark, operator_time AS operatorTime
       FROM sys_operation_log
       WHERE 1 = 1
        AND (:username IS NULL OR username LIKE CONCAT('%', :username, '%'))
        AND (:tenantId IS NULL OR tenant_id = :tenantId)
        AND (:moduleName IS NULL OR module_name LIKE CONCAT('%', :moduleName, '%'))
        AND (:businessType IS NULL OR business_type = :businessType)
        AND (:success IS NULL OR success = :success)
        AND (:clientIp IS NULL OR client_ip LIKE CONCAT('%', :clientIp, '%'))
        AND (:requestId IS NULL OR request_id LIKE CONCAT('%', :requestId, '%'))
        AND (:startTime IS NULL OR operator_time >= :startTime)
        AND (:endTime IS NULL OR operator_time <= :endTime)
       ORDER BY operator_time DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    return { rows, total: totalRow?.total ?? 0 };
  }

  async listUploadAudits(filters: UploadAuditQuery, page: PageParams = getPageParams(filters)) {
    const params = { ...filters, offset: page.offset, pageSize: page.pageSize };
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(1) AS total FROM sys_upload_audit WHERE 1 = 1
        AND (:username IS NULL OR username LIKE CONCAT('%', :username, '%'))
        AND (:tenantId IS NULL OR tenant_id = :tenantId)
        AND (:moduleName IS NULL OR module_name LIKE CONCAT('%', :moduleName, '%'))
        AND (:accessType IS NULL OR access_type = :accessType)
        AND (:uploadStatus IS NULL OR upload_status = :uploadStatus)
        AND (:fileName IS NULL OR original_name LIKE CONCAT('%', :fileName, '%'))
        AND (:clientIp IS NULL OR client_ip LIKE CONCAT('%', :clientIp, '%'))
        AND (:requestId IS NULL OR request_id LIKE CONCAT('%', :requestId, '%'))
        AND (:startTime IS NULL OR create_time >= :startTime)
        AND (:endTime IS NULL OR create_time <= :endTime)`,
      params,
    );
    const rows = await query(
      `SELECT audit_id AS auditId, tenant_id AS tenantId, user_id AS userId, username, module_name AS moduleName,
              access_type AS accessType, storage_id AS storageId, storage_type AS storageType,
              bucket_name AS bucketName, object_name AS objectName, original_name AS originalName,
              safe_name AS safeName, file_ext AS fileExt, mime_type AS mimeType, file_size AS fileSize,
              max_upload_bytes AS maxUploadBytes, upload_status AS uploadStatus, fail_reason AS failReason,
              client_ip AS clientIp, user_agent AS userAgent, request_id AS requestId, file_id AS fileId,
              file_url AS fileUrl, create_time AS createTime
       FROM sys_upload_audit
       WHERE 1 = 1
        AND (:username IS NULL OR username LIKE CONCAT('%', :username, '%'))
        AND (:tenantId IS NULL OR tenant_id = :tenantId)
        AND (:moduleName IS NULL OR module_name LIKE CONCAT('%', :moduleName, '%'))
        AND (:accessType IS NULL OR access_type = :accessType)
        AND (:uploadStatus IS NULL OR upload_status = :uploadStatus)
        AND (:fileName IS NULL OR original_name LIKE CONCAT('%', :fileName, '%'))
        AND (:clientIp IS NULL OR client_ip LIKE CONCAT('%', :clientIp, '%'))
        AND (:requestId IS NULL OR request_id LIKE CONCAT('%', :requestId, '%'))
        AND (:startTime IS NULL OR create_time >= :startTime)
        AND (:endTime IS NULL OR create_time <= :endTime)
       ORDER BY create_time DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    return { rows, total: totalRow?.total ?? 0 };
  }
}
