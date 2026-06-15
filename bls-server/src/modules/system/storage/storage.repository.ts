import { execute, query, queryOne } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition } from '../../../core/sql';
import { getCurrentTenantId, tenantWhere } from '../../../middleware/tenant';
import { getPageParams, PageParams } from '../../../shared/utils/pagination';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import {
  CreateStorageInput,
  FileRecord,
  StorageConfig,
  StorageQuery,
  UpdateStorageInput,
} from './storage.model';

export class StorageRepository {
  async list(filters: StorageQuery, page: PageParams = getPageParams(filters)): Promise<{ rows: StorageConfig[]; total: number }> {
    const tenant = tenantWhere('sys_storage_config');
    const where = joinConditions([
      tenant,
      likeCondition('storage_name', 'storageName', filters.storageName),
      eqCondition('storage_type', 'storageType', filters.storageType),
      eqCondition('status', 'status', filters.status),
      { sql: 'deleted = 0', params: {} },
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(1) AS total FROM sys_storage_config ${where.sql}`, where.params);
    const rows = await query<StorageConfig>(`SELECT storage_id AS storageId, tenant_id AS tenantId, storage_name AS storageName, storage_type AS storageType, endpoint, region, port, use_ssl AS useSsl, access_key AS accessKey, secret_key AS secretKey, public_bucket AS publicBucket, private_bucket AS privateBucket, public_base_url AS publicBaseUrl, private_base_url AS privateBaseUrl, path_style AS pathStyle, config_json AS configJson, policy_json AS policyJson, is_default AS isDefault, status, remark, create_by AS createBy, create_time AS createTime, update_by AS updateBy, update_time AS updateTime FROM sys_storage_config ${where.sql} ORDER BY is_default DESC, storage_id DESC LIMIT :offset, :pageSize`, params);
    return { rows, total: totalRow?.total ?? 0 };
  }

  async findById(storageId: string): Promise<StorageConfig | null> {
    const tenant = tenantWhere('sys_storage_config');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return queryOne<StorageConfig>(`SELECT storage_id AS storageId, tenant_id AS tenantId, storage_name AS storageName, storage_type AS storageType, endpoint, region, port, use_ssl AS useSsl, access_key AS accessKey, secret_key AS secretKey, public_bucket AS publicBucket, private_bucket AS privateBucket, public_base_url AS publicBaseUrl, private_base_url AS privateBaseUrl, path_style AS pathStyle, config_json AS configJson, policy_json AS policyJson, is_default AS isDefault, status, remark, create_by AS createBy, create_time AS createTime, update_by AS updateBy, update_time AS updateTime FROM sys_storage_config WHERE storage_id = :storageId AND deleted = 0${tenantSql} LIMIT 1`, { storageId, ...tenant.params });
  }

  async findDefault(tenantId?: string | null): Promise<StorageConfig | null> {
    const currentTenantId = tenantId ?? getCurrentTenantId() ?? '000000';
    return queryOne<StorageConfig>(`SELECT storage_id AS storageId, tenant_id AS tenantId, storage_name AS storageName, storage_type AS storageType, endpoint, region, port, use_ssl AS useSsl, access_key AS accessKey, secret_key AS secretKey, public_bucket AS publicBucket, private_bucket AS privateBucket, public_base_url AS publicBaseUrl, private_base_url AS privateBaseUrl, path_style AS pathStyle, config_json AS configJson, policy_json AS policyJson, is_default AS isDefault, status, remark, create_by AS createBy, create_time AS createTime, update_by AS updateBy, update_time AS updateTime FROM sys_storage_config WHERE deleted = 0 AND status = '1' AND (tenant_id = :tenantId OR tenant_id = '000000') ORDER BY CASE WHEN tenant_id = :tenantId THEN 0 ELSE 1 END, is_default DESC, create_time DESC LIMIT 1`, { tenantId: currentTenantId });
  }

  async create(input: CreateStorageInput): Promise<string> {
    const storageId = input.storageId ?? generateSnowflakeId();
    const tenantId = input.tenantId ?? getCurrentTenantId() ?? '000000';
    await execute(`INSERT INTO sys_storage_config (storage_id, tenant_id, storage_name, storage_type, endpoint, region, port, use_ssl, access_key, secret_key, public_bucket, private_bucket, public_base_url, private_base_url, path_style, config_json, policy_json, is_default, status, remark) VALUES (:storageId, :tenantId, :storageName, :storageType, :endpoint, :region, :port, :useSsl, :accessKey, :secretKey, :publicBucket, :privateBucket, :publicBaseUrl, :privateBaseUrl, :pathStyle, :configJson, :policyJson, :isDefault, :status, :remark)`, { storageId, tenantId, storageName: input.storageName, storageType: input.storageType, endpoint: input.endpoint ?? null, region: input.region ?? null, port: input.port ?? null, useSsl: input.useSsl ?? '1', accessKey: input.accessKey ?? null, secretKey: input.secretKey ?? null, publicBucket: input.publicBucket ?? null, privateBucket: input.privateBucket ?? null, publicBaseUrl: input.publicBaseUrl ?? null, privateBaseUrl: input.privateBaseUrl ?? null, pathStyle: input.pathStyle ?? '0', configJson: input.configJson ?? null, policyJson: input.policyJson ?? null, isDefault: input.isDefault ?? '0', status: input.status ?? '1', remark: input.remark ?? null });
    return storageId;
  }

  async update(input: UpdateStorageInput): Promise<void> {
    const tenant = tenantWhere('sys_storage_config');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    await execute(`UPDATE sys_storage_config SET storage_name = :storageName, storage_type = :storageType, endpoint = :endpoint, region = :region, port = :port, use_ssl = :useSsl, access_key = :accessKey, secret_key = :secretKey, public_bucket = :publicBucket, private_bucket = :privateBucket, public_base_url = :publicBaseUrl, private_base_url = :privateBaseUrl, path_style = :pathStyle, config_json = :configJson, policy_json = :policyJson, is_default = :isDefault, status = :status, remark = :remark WHERE storage_id = :storageId AND deleted = 0${tenantSql}`, { storageId: input.storageId, storageName: input.storageName, storageType: input.storageType, endpoint: input.endpoint ?? null, region: input.region ?? null, port: input.port ?? null, useSsl: input.useSsl ?? '1', accessKey: input.accessKey ?? null, secretKey: input.secretKey ?? null, publicBucket: input.publicBucket ?? null, privateBucket: input.privateBucket ?? null, publicBaseUrl: input.publicBaseUrl ?? null, privateBaseUrl: input.privateBaseUrl ?? null, pathStyle: input.pathStyle ?? '0', configJson: input.configJson ?? null, policyJson: input.policyJson ?? null, isDefault: input.isDefault ?? '0', status: input.status ?? '1', remark: input.remark ?? null, ...tenant.params });
  }

  async listFiles(filters: { moduleName?: string; accessType?: string }, page: PageParams = getPageParams({})): Promise<{ rows: FileRecord[]; total: number }> {
    const where = joinConditions([
      tenantWhere('sys_file'),
      likeCondition('module_name', 'moduleName', filters.moduleName),
      eqCondition('access_type', 'accessType', filters.accessType),
      { sql: 'deleted = 0', params: {} },
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(1) AS total FROM sys_file ${where.sql}`, where.params);
    const rows = await query<FileRecord>(`SELECT file_id AS fileId, tenant_id AS tenantId, storage_id AS storageId, bucket_name AS bucketName, object_name AS objectName, original_name AS originalName, file_name AS fileName, file_ext AS fileExt, mime_type AS mimeType, file_size AS fileSize, access_type AS accessType, module_name AS moduleName, url, create_by AS createBy, create_time AS createTime, update_by AS updateBy, update_time AS updateTime FROM sys_file ${where.sql} ORDER BY file_id DESC LIMIT :offset, :pageSize`, params);
    return { rows, total: totalRow?.total ?? 0 };
  }
}
