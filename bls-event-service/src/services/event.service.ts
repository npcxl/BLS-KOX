import { execute, query } from '../core/database';
import type { EventInput, QueryEventsInput } from '../schemas/event.schema';
import {
  eventsReceivedTotal,
  eventsWriteSuccessTotal,
  eventsWriteFailedTotal,
} from '../observability/metrics';

/** 批量写入事件 */
export async function writeEvents(events: EventInput[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const event of events) {
    eventsReceivedTotal.inc({ event_type: event.eventType });
    try {
      await execute(
        `INSERT INTO sys_event_log (
          event_id, tenant_id, user_id, username, event_type, risk_level,
          source_service, source_module, resource_type, resource_id,
          request_id, trace_id, client_ip, user_agent, detail_json, created_at
        ) VALUES (
          :eventId, :tenantId, :userId, :username, :eventType, :riskLevel,
          :sourceService, :sourceModule, :resourceType, :resourceId,
          :requestId, :traceId, :clientIp, :userAgent, :detailJson, :createdAt
        )`,
        {
          eventId: event.eventId,
          tenantId: event.tenantId,
          userId: event.userId ?? null,
          username: event.username ?? null,
          eventType: event.eventType,
          riskLevel: event.riskLevel ?? 'medium',
          sourceService: event.sourceService ?? 'bls-server',
          sourceModule: event.sourceModule ?? null,
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          requestId: event.requestId ?? null,
          traceId: event.traceId ?? null,
          clientIp: event.clientIp ?? null,
          userAgent: event.userAgent ?? null,
          detailJson: event.detailJson ? JSON.stringify(event.detailJson) : null,
          createdAt: event.createdAt ? new Date(event.createdAt) : new Date(),
        },
      );
      eventsWriteSuccessTotal.inc({ event_type: event.eventType });
      success++;
    } catch (error) {
      console.error('[event-service] write event failed:', {
        eventId: event.eventId,
        eventType: event.eventType,
        error: String(error),
      });
      eventsWriteFailedTotal.inc({ event_type: event.eventType });
      failed++;
    }
  }

  return { success, failed };
}

/** 查询事件列表 */
export async function queryEvents(params: QueryEventsInput) {
  const conditions: string[] = [];
  const bindings: Record<string, unknown> = {};

  if (params.tenantId) {
    conditions.push('tenant_id = :tenantId');
    bindings.tenantId = params.tenantId;
  }
  if (params.eventType) {
    conditions.push('event_type = :eventType');
    bindings.eventType = params.eventType;
  }
  if (params.riskLevel) {
    conditions.push('risk_level = :riskLevel');
    bindings.riskLevel = params.riskLevel;
  }
  if (params.startTime) {
    conditions.push('created_at >= :startTime');
    bindings.startTime = new Date(params.startTime);
  }
  if (params.endTime) {
    conditions.push('created_at <= :endTime');
    bindings.endTime = new Date(params.endTime);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (params.page - 1) * params.pageSize;

  const [countRows] = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM sys_event_log ${whereClause}`,
    bindings,
  );
  const total = Number(countRows?.cnt ?? 0);

  const rows = await query<any>(
    `SELECT * FROM sys_event_log ${whereClause} ORDER BY created_at DESC LIMIT :offset, :limit`,
    { ...bindings, offset, limit: params.pageSize },
  );

  return { total, rows, page: params.page, pageSize: params.pageSize };
}
