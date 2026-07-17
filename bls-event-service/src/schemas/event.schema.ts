import { z } from 'zod';

export const eventSchema = z.object({
  eventId: z.string().min(1).max(64),
  tenantId: z.string().min(1).max(32),
  userId: z.string().max(32).nullable().optional(),
  username: z.string().max(50).nullable().optional(),
  eventType: z.string().min(1).max(64),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  sourceService: z.string().max(64).default('bls-server'),
  sourceModule: z.string().max(64).nullable().optional(),
  resourceType: z.string().max(64).nullable().optional(),
  resourceId: z.string().max(32).nullable().optional(),
  requestId: z.string().max(64).nullable().optional(),
  traceId: z.string().max(64).nullable().optional(),
  clientIp: z.string().max(45).nullable().optional(),
  userAgent: z.string().max(500).nullable().optional(),
  detailJson: z.unknown().nullable().optional(),
  createdAt: z.string().datetime().optional(),
});

export const eventsArraySchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

export const queryEventsSchema = z.object({
  tenantId: z.string().max(32).optional(),
  eventType: z.string().max(64).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export type EventInput = z.infer<typeof eventSchema>;
export type QueryEventsInput = z.infer<typeof queryEventsSchema>;
