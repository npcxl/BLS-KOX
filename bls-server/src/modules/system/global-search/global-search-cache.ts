import { getRedisClient } from '../../../shared/utils/redis';
import { GlobalSearchRepository } from './global-search.repository';
import { SearchConfigRecord } from './global-search.model';

const CONFIG_CACHE_KEY = 'global_search:configs';
const PERMISSION_CACHE_KEY = (tenantId: string, userId: string) => `global_search:permissions:${tenantId}:${userId}`;
const ROLE_CACHE_KEY = (tenantId: string, userId: string) => `global_search:roles:${tenantId}:${userId}`;

function redis() {
  return getRedisClient();
}

export async function getCachedGlobalSearchConfigs(repo = new GlobalSearchRepository()): Promise<SearchConfigRecord[]> {
  const client = redis();
  if (!client) return repo.listEnabled();
  const cached = await client.get(CONFIG_CACHE_KEY);
  if (cached) return JSON.parse(cached) as SearchConfigRecord[];
  const rows = await repo.listEnabled();
  await client.set(CONFIG_CACHE_KEY, JSON.stringify(rows), 'EX', 60 * 30);
  return rows;
}

export async function clearGlobalSearchConfigCache(): Promise<void> {
  const client = redis();
  if (!client) return;
  await client.del(CONFIG_CACHE_KEY);
}

export async function getCachedUserPermissions(tenantId: string, userId: string): Promise<string[]> {
  const client = redis();
  if (!client) return [];
  const cached = await client.get(PERMISSION_CACHE_KEY(tenantId, userId));
  return cached ? (JSON.parse(cached) as string[]) : [];
}

export async function setCachedUserPermissions(tenantId: string, userId: string, permissions: string[]): Promise<void> {
  const client = redis();
  if (!client) return;
  await client.set(PERMISSION_CACHE_KEY(tenantId, userId), JSON.stringify(permissions), 'EX', 60 * 10);
}

export async function getCachedUserRoles(tenantId: string, userId: string): Promise<unknown[]> {
  const client = redis();
  if (!client) return [];
  const cached = await client.get(ROLE_CACHE_KEY(tenantId, userId));
  return cached ? (JSON.parse(cached) as unknown[]) : [];
}

export async function setCachedUserRoles(tenantId: string, userId: string, roles: unknown[]): Promise<void> {
  const client = redis();
  if (!client) return;
  await client.set(ROLE_CACHE_KEY(tenantId, userId), JSON.stringify(roles), 'EX', 60 * 10);
}

export async function clearGlobalSearchUserCache(tenantId: string, userId: string): Promise<void> {
  const client = redis();
  if (!client) return;
  await client.del(PERMISSION_CACHE_KEY(tenantId, userId), ROLE_CACHE_KEY(tenantId, userId));
}
