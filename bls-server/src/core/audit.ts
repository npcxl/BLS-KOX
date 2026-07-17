import { execute } from './database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import type { Context } from 'koa';
import { publishEvent } from '../services/event-client';

export interface AuditActor {
  tenantId: string;
  userId: string | null;
  username: string | null;
  clientIp: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface OperationLogInput {
  actor: AuditActor;
  moduleName?: string | null;
  businessType: string;
  title: string;
  requestMethod?: string | null;
  requestUrl?: string | null;
  requestParams?: string | null;
  responseStatus?: number | null;
  success: '0' | '1';
  errorMessage?: string | null;
  errorStack?: string | null;
  costTimeMs?: number | null;
  remark?: string | null;
  userId?: string | null;
  username?: string | null;
  tenantId?: string | null;
}

export interface UploadAuditInput {
  tenantId?: string | null;
  userId?: string | null;
  username?: string | null;
  actor: AuditActor;
  moduleName?: string | null;
  accessType: 'public' | 'private';
  storageId?: string | null;
  storageType?: string | null;
  bucketName?: string | null;
  objectName?: string | null;
  originalName: string;
  safeName: string;
  fileExt?: string | null;
  mimeType?: string | null;
  fileSize: number;
  maxUploadBytes: number;
  clientIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  uploadStatus: '0' | '1';
  failReason?: string | null;
  fileId?: string | null;
  fileUrl?: string | null;
}

export interface LoginLogInput {
  actor: AuditActor;
  loginType?: string | null;
  loginStatus: '0' | '1';
  failReason?: string | null;
}

export function getAuditActor(
  ctx: Context | any,
  tenantId?: string | null,
  fallback?: Partial<Pick<AuditActor, 'userId' | 'username'>>,
): AuditActor {
  return {
    tenantId: tenantId ?? ctx?.state?.tenantId ?? ctx?.state?.user?.tenantId ?? '000000',
    userId: ctx?.state?.user?.userId ?? fallback?.userId ?? null,
    username: ctx?.state?.user?.username ?? fallback?.username ?? null,
    clientIp: ctx?.ip ?? null,
    userAgent: ctx?.headers?.['user-agent'] ?? null,
    requestId: ctx?.headers?.['x-request-id'] ?? ctx?.state?.requestId ?? null,
  };
}

function normalizeText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

export async function writeOperationLog(input: any): Promise<void> {
  await execute(
    `INSERT INTO sys_operation_log (
      log_id, tenant_id, user_id, username, module_name, business_type, title,
      request_method, request_url, request_params, response_status, success, error_message,
      error_stack, client_ip, user_agent, request_id, cost_time_ms, remark
    ) VALUES (
      :logId, :tenantId, :userId, :username, :moduleName, :businessType, :title,
      :requestMethod, :requestUrl, :requestParams, :responseStatus, :success, :errorMessage,
      :errorStack, :clientIp, :userAgent, :requestId, :costTimeMs, :remark
    )`,
    {
      logId: generateSnowflakeId(),
      tenantId: input.actor.tenantId,
      userId: input.userId ?? input.actor.userId,
      username: input.username ?? input.actor.username,
      moduleName: normalizeText(input.moduleName),
      businessType: input.businessType,
      title: input.title,
      requestMethod: normalizeText(input.requestMethod),
      requestUrl: normalizeText(input.requestUrl),
      requestParams: normalizeText(input.requestParams),
      responseStatus: input.responseStatus ?? null,
      success: input.success,
      errorMessage: normalizeText(input.errorMessage),
      errorStack: normalizeText(input.errorStack),
      clientIp: input.actor.clientIp,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
      costTimeMs: input.costTimeMs ?? null,
      remark: normalizeText(input.remark),
    },
  );

  // 发送操作审计事件到 event-service
  publishEvent({
    tenantId: input.actor.tenantId,
    userId: input.userId ?? input.actor.userId,
    username: input.username ?? input.actor.username,
    eventType: 'OPERATION_AUDIT',
    riskLevel: input.success === '0' ? 'medium' : 'low',
    sourceModule: normalizeText(input.moduleName) ?? undefined,
    resourceType: input.businessType,
    requestId: input.actor.requestId,
    clientIp: input.actor.clientIp,
    userAgent: input.actor.userAgent,
    detailJson: { title: input.title, requestMethod: input.requestMethod, requestUrl: input.requestUrl },
  }).catch(() => { /* fire-and-forget */ });
}

export async function writeUploadAudit(input: any): Promise<void> {
  const actor = input.actor ?? getAuditActor({});
  await execute(
    `INSERT INTO sys_upload_audit (
      audit_id, tenant_id, user_id, username, module_name, access_type, storage_id, storage_type,
      bucket_name, object_name, original_name, safe_name, file_ext, mime_type, file_size,
      max_upload_bytes, upload_status, fail_reason, client_ip, user_agent, request_id, file_id, file_url
    ) VALUES (
      :auditId, :tenantId, :userId, :username, :moduleName, :accessType, :storageId, :storageType,
      :bucketName, :objectName, :originalName, :safeName, :fileExt, :mimeType, :fileSize,
      :maxUploadBytes, :uploadStatus, :failReason, :clientIp, :userAgent, :requestId, :fileId, :fileUrl
    )`,
    {
      auditId: generateSnowflakeId(),
      tenantId: actor.tenantId ?? '',
      userId: actor.userId,
      username: actor.username,
      moduleName: normalizeText(input.moduleName),
      accessType: input.accessType,
      storageId: normalizeText(input.storageId),
      storageType: normalizeText(input.storageType),
      bucketName: normalizeText(input.bucketName),
      objectName: normalizeText(input.objectName),
      originalName: input.originalName,
      safeName: input.safeName,
      fileExt: normalizeText(input.fileExt),
      mimeType: normalizeText(input.mimeType),
      fileSize: input.fileSize,
      maxUploadBytes: input.maxUploadBytes,
      uploadStatus: input.uploadStatus,
      failReason: normalizeText(input.failReason),
      clientIp: actor.clientIp,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      fileId: normalizeText(input.fileId),
      fileUrl: normalizeText(input.fileUrl),
    },
  );
}

export async function writeLoginLog(input: LoginLogInput): Promise<void> {
  await execute(
    `INSERT INTO sys_login_log (
      log_id, tenant_id, user_id, username, login_type, login_status, fail_reason,
      login_ip, user_agent, request_id, login_time
    ) VALUES (
      :logId, :tenantId, :userId, :username, :loginType, :loginStatus, :failReason,
      :loginIp, :userAgent, :requestId, CURRENT_TIMESTAMP
    )`,
    {
      logId: generateSnowflakeId(),
      tenantId: input.actor.tenantId,
      userId: input.actor.userId,
      username: input.actor.username,
      loginType: input.loginType ?? 'password',
      loginStatus: input.loginStatus,
      failReason: normalizeText(input.failReason),
      loginIp: input.actor.clientIp,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
    },
  );
}
