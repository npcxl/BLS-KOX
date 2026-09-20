# 06 — File Upload & Excel Security (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

Two shared mechanisms used by several pages:

1. **File upload** — `POST /api/system/storage/upload`, used by the file manager, avatar change,
   and any attachment upload.
2. **Excel import/export** — `/api/common/excel/*`, used by the entity lists.

---

## 1. File upload

### Endpoint

| Method | Path | Permission | Handler |
|---|---|---|---|
| POST | `/api/system/storage/upload` | `system:file:upload` | `bls-server/src/api/system/storage/index.ts` `handleUpload` |

Multipart form fields: `file` (required), `accessType` (`public` \| `private`, default `private`),
`moduleName` (default `common`), optional `storageId`.

`app.ts` enables `koaBody({multipart: true, formidable: {multiples: false}})` — multiple files
are disabled.

### Validation pipeline (in order)

1. **Distributed lock** `storage:upload` (lease 30 s, wait 5 s). Busy → HTTP **409**
   `操作太频繁，请稍后再试`. Unavailable (Redis down) → degrade and continue.
2. **Tenant fail-closed**: missing tenant → `401 租户上下文缺失`, no DB query.
3. **Storage backend resolution**: choose `sys_storage_config` by `storageId`, else the row with
   `is_default='1'`, else the earliest `create_time`; tenant scoped + `deleted=0`.
   None → `500 未配置存储服务`.
4. **Metadata validation** (`validateUploadMeta`):
   - `moduleName` must match `/^[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_-]{0,31}$/`
     (rejected as-is, never sanitised).
   - `accessType` ∈ `{public, private}`.
5. **Extension + MIME whitelist** (`validateFile`, first pass, no buffer):

   | Allowed extensions | Allowed MIME |
   |---|---|
   | `.jpg .jpeg .png .gif .webp .pdf .doc .docx .xls .xlsx .txt .csv .json .zip` | `image/jpeg image/png image/gif image/webp application/pdf text/plain text/csv application/json application/zip` |

   SVG is intentionally disabled. Extension ↔ MIME must match (`EXT_MIME_MAP`).
6. **Size limit**: `validateFileSize(size, maxSizeBytes)`. Default `100 MB`,
   overridden by the dynamic config `uploadLimitMB` (`sys.upload.maxSize`, default 20, 1–500).
7. **Magic-number check** (image only, second `validateFile` pass with the buffer):
   JPEG `ffd8ff`, PNG `89504e47`, GIF `47414638`, WEBP `RIFF????WEBP`.
   The detected type must match both the extension and the MIME. Unknown content →
   `文件内容与扩展名不匹配` + a `SECURITY_VALIDATION_FAILED` security log.
8. **Object key**: `` `${moduleName}/${generateObjectKey(originalName)}` `` where
   `generateObjectKey` = `randomUUID()` + extension. The client filename never becomes a path,
   which removes path-traversal risk (`sanitizeFilename` also strips `/\:*?"<>|` and `..`).
9. **Persist**: insert `sys_file`; the public URL is only produced for `accessType === 'public'`;
   write `sys_upload_audit`.
10. Response: `{fileId, url, bucketName, objectName, originalName, fileName, fileSize}`.

There is **no antivirus scan**. Non-image types are accepted on extension + MIME alone.

### Storage providers (`bls-server/src/api/system/storage/providers/`)

| `storageType` | Provider | Real implementation? |
|---|---|---|
| `minio` | `MinioProvider` | **Yes** — `putObject`, `removeObject`, public URL, presigned private URL (default 300 s), `ensureBucket` |
| `aliyun_oss` | `AliyunOssProvider` | stub (metadata only) |
| `tencent_cos` | `TencentCosProvider` | stub |
| `aws_s3` | `AwsS3Provider` | stub |
| `local` / unknown | `LocalProvider` | stub |

`qiniu_kodo` and `huawei_obs` are declared in the type unions but have no provider and fall
through to `LocalProvider`.

### Secret handling

- `sys_storage_config.access_key` / `secret_key` are returned **masked only**:
  `maskSecret` → `****` (≤8 chars) or `first4****last4`.
- On update, an incoming value that is empty/null or contains `****` means "keep the stored
  value". Add/edit responses return only `{storageId}` — never the keys.
- `writeSecurityLog` additionally redacts `secret`, `apiSecret`, `signSecret`.

### Policies applied to this endpoint

- Replay: default write rule → `nonce`, window 120 s, nonce TTL 300 s.
- Rate limit: `user` **30 / 60 s** (dedicated rule).
- Permission: `system:file:upload`. Tenant fail-closed.

---

## 2. Excel import / export

Implementation: `bls-server/src/api/common/excel/index.ts` (prefix `/common/excel`
→ `/api/common/excel`). All three routes require `jwtAuth()`.

### Supported meta keys (`EXCEL_METAS`)

| `metaKey` | Table | `pageCode` | tenant aware | has `deleted` |
|---|---|---|---|---|
| `system-user` | `sys_user` | `system_user` | yes | yes |
| `system-config` | `sys_config` | `system_config` | yes | yes |
| `system-role` | `sys_role` | `system_role` | yes | yes |
| `system-dept` | `sys_dept` | `system_dept` | yes | yes |
| `system-tenant` | `sys_tenant` | `system_tenant` | yes | yes |
| `system-package` | `sys_package` | `system_package` | no (global) | no |

Column set / headers / dict bindings come from `sys_page_column_config` for the `pageCode`.

### Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/common/excel/template?metaKey=<key>` | Builds an xlsx template with dict drop-down validation. |
| POST | `/api/common/excel/export` | Body `{metaKey, exportMode?: 'limit', customMaxNum?, keyword?, ...filters}`. Returns the xlsx binary; response headers `x-excel-matched-count`, `x-excel-export-count`. |
| POST | `/api/common/excel/import` | Multipart `{metaKey, file}`. Returns `{successCount, failedCount, totalCount, errorRows?}`. |

### Export rules

- Only `visible` columns are exported; `roleIds` and `password` are always excluded.
- Dict values are converted value → label.
- Keyword search uses the `searchable` columns; per-column exact filters are applied for any
  supplied column key.
- Hard cap **`MAX_EXPORT = 10000`** rows; `exportMode: 'limit'` allows a smaller
  `customMaxNum`.
- Distributed lock `excel:export:{metaKey}` (lease 60 s, wait 10 s) → busy = HTTP 409
  `导出任务进行中，请稍后再试`.
- Tenant filter: `getCurrentTenantId() ?? '000000'` when the table is tenant aware.

### Import rules

- Distributed lock `excel:import:{metaKey}` (lease 120 s, wait 10 s) → busy = HTTP 409.
- Headers are matched to `sys_page_column_config.title` (trailing `（...）` is stripped).
  No matched column → `400 未匹配到任何列，请使用正确的模板`.
- Import skips `SKIP_IMPORT` fields: `userId/user_id`, `roleIds`, `password`,
  `createTime/create_time`, `updateTime/update_time`, `createBy/create_by`,
  `updateBy/update_by`, `deptId/dept_id`, `tenantId/tenant_id`.
- Required columns are enforced per row; missing → row error `"<title>不能为空"`.
- Dict columns accept the label and convert label → value.
- **Upsert by natural key**: user→`username`, role→`role_name`, config→`config_key`,
  dept→`dept_name`, tenant→`tenant_name`, package→`package_name` (tenant scoped where possible).
- User import defaults: `password = 'e10adc3949ba59abbe56e057f20f883e'` (MD5 of `123456`),
  `gender = '2'`.
- Snowflake id is generated when the pk is not supplied; `tenant_id` and `deleted = 0` are
  injected server-side.
- Errors are returned for at most the first 50 failing rows
  (`errorRows: [{row, errors, data}]`); duplicate-key errors become
  `数据已存在（唯一约束冲突）`.

### Policies applied

- Replay: default write rule (`nonce`, window 120 s, TTL 300 s) for export/import (POST).
  `GET /template` is exempt (read).
- Rate limit: `POST /export` → `user` **5 / 60 s** and `tenant` **200 / 3600 s**.
  Import and template use the default buckets (write 300/min, read 600/min).
- Permissions: the Excel module itself only requires `jwtAuth()`. Pages gate the buttons with
  their own `import` / `export` permission keys (usually declared but **not** enforced by the
  shared `ExcelToolbar`).

---

## 3. Frontend pieces

| Piece | File | Notes |
|---|---|---|
| Excel toolbar | `bls-admin/src/components/ExcelToolbar/index.tsx` | template download / export / import; needs `metaKey` |
| File upload hook | `bls-admin/src/hooks/useFileUpload.ts` | posts multipart to `uploadUrl` |
| Upload modal | `bls-admin/src/components/FileUploadModal/index.tsx` | default `uploadUrl` = `/api/system/storage/upload` |
| Replay headers for raw fetch | `bls-admin/src/services/security/replayInterceptor.ts` | `buildReplayHeaders` |

`CrudTablePage` computes `canImport` / `canExport` from the `permissions` prop but the Excel
toolbar is only rendered when `excelMetaKey` is provided; several pages pass permission keys
without rendering any toolbar (see each page's "Known gaps" section).
