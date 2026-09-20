# Page — Storage Configuration (`/file-config/storage`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/file-config/storage` (name 存储配置, parent 文件中心) |
| Component | `bls-admin/src/pages/system/file-config/storage/index.tsx` (`StoragePage`) |
| Purpose | CRUD of object-storage backends (`sys_storage_config`) per tenant; choose the default backend |
| Backend module | `bls-server/src/api/system/storage/index.ts` |
| Tables | `sys_storage_config` (main), plus `sys_file`, `sys_upload_audit` for uploads |
| Shared docs | `00-common/01-redis.md` (upload lock), `02-replay-protection.md`, `06-file-and-excel-security.md` |

This module also implements **file upload** (`POST /upload`) which is shared with the File Manager
page and the avatar flow.

---

## 2. Frontend → API map

Resource: `{ basePath: '/api/system/storage', status: false }` (no status toggle).

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search (`storageName` LIKE, `storageType` =) | `listResource` via `useCrudTable` | GET | `/api/system/storage/list` |
| Create | `addResource` | POST | `/api/system/storage/add` |
| Edit | `editResource` | PUT | `/api/system/storage/edit` |
| Delete (single / batch) | `removeResource` | DELETE | `/api/system/storage/remove` |
| Toggle **是否默认** (Switch column) | inline `request({...record, isDefault:'1'|'0'})` | PUT | `/api/system/storage/edit` |
| Columns | `getPageColumnConfig('system_storage')` | GET | `/api/system/page-config/page/system_storage/columns` |
| Dicts | `useDict('sys_storage_type')`, `useDict('sys_status')` | GET | `/api/system/dict/data/type?dictType=...` |

`beforeSubmit` coerces `useSsl`/`pathStyle` → `0|1`, `isDefault`/`status` → string, and
JSON-stringifies `configJson`/`policyJson`.

There is **no "test connection"** feature anywhere (frontend or backend). The page has
`resource.status = false` and no `excelMetaKey`, so there is no status toggle and no Excel
toolbar (the declared `system:storage:import/export/status` permissions are unused).

---

## 3. Backend endpoints

Module: `bls-server/src/api/system/storage/index.ts`, custom router
`prefix: '/system/storage'`, `ST = 'sys_storage_config'`. **No CRUD factory.**

Zod helpers: `numish` (number|string|boolean → 0/1 or number), `jsonish`
(string|record|array|null → validated with `JSON.parse`, else `ValidationError('JSON 字段格式不合法')`).

`storageCreateSchema`:

| Field | Rule |
|---|---|
| `storageName` | 1–100, required |
| `storageType` | 1–30, required — `minio` \| `aliyun_oss` \| `tencent_cos` \| `aws_s3` \| `local` |
| `endpoint` | ≤500 nullish |
| `region` | ≤100 nullish |
| `port`, `useSsl`, `pathStyle` | numish optional |
| `accessKey`, `secretKey` | ≤500 nullish |
| `publicBucket`, `privateBucket` | ≤100 nullish |
| `publicBaseUrl`, `privateBaseUrl` | ≤1000 nullish |
| `configJson`, `policyJson` | jsonish |
| `isDefault` | numish optional |
| `status` | enum `'0' \| '1'` optional |
| `remark` | ≤500 nullish |

`storageUpdateSchema` = `storageCreateSchema.partial().extend({storageId: 1–32})`.
`parseOrThrow` → `ValidationError('参数错误', [{path, message}])`.

### Endpoints

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/list` | `system:storage:list` | `requireTenantId()`, `deleted=0 AND tenant_id=?`; `storageName` LIKE, `storageType` =; `pageNum`/`pageSize` (1–100); `ORDER BY create_time DESC`; rows go through `maskRow` |
| POST | `/add` | `system:storage:add` | Zod; snowflake `storageId`; **transaction**: `applyDefaultFlag` then insert (`deleted=0`). Returns `{storageId}` |
| PUT | `/edit` | `system:storage:edit` | Zod; loads the existing row (tenant + `deleted=0`) else 404; transaction `applyDefaultFlag` + update; 0 rows → 404 |
| DELETE | `/remove` | `system:storage:remove` | `extractIds`; all ids must be tenant-visible else 404; soft delete |
| GET | `/:storageId` | `system:storage:list` | Detail, tenant scoped + `deleted=0`, masked |
| POST | `/upload` | `system:file:upload` | See `00-common/06-file-and-excel-security.md` |
| GET | `/files` | `system:file:list` | File list (used by the File Manager page) |
| DELETE | `/files/remove` | `system:file:remove` | Batch soft delete of files |
| DELETE | `/file/:fileId` | `system:file:remove` | `assertTenantResource('sys_file','file_id',fileId)` then soft delete |
| GET | `/file/:fileId/url` | `system:file:download` | Returns the `sys_file` row |
| GET | `/file/:fileId/download` | `system:file:download` | Returns the `sys_file` row as JSON (⚠ see §7) |

### Default-backend rule

`applyDefaultFlag` enforces "at most one default per tenant": when `is_default === 1`, all other
rows of the same tenant with `deleted=0` are set to `is_default = 0` before the insert/update.

### Secret masking

- `maskSecret`: falsy → `null`; ≤8 chars → `"****"`; else `first4****last4`.
- `maskRow` applies it to `access_key` and `secret_key` for `GET /list` and `GET /:storageId`.
- `keyRule` in `buildStorageValues`: an incoming key that is `undefined | null | '' | masked` keeps
  the stored value on edit (and becomes `null` on create). Only a genuine value overwrites it.
- Add/edit responses return only `{storageId}` — never the keys.
- `writeSecurityLog` additionally redacts `secret` / `apiSecret` / `signSecret`.

### Provider behaviour

`s3`/OSS/COS providers are **stubs** (metadata only). Only `MinioProvider` performs real
`putObject` / `presignedGetObject` / bucket creation. Unknown types fall through to
`LocalProvider`. See `00-common/06-file-and-excel-security.md`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /:storageId` | off | read 600/60 | `system:storage:list` |
| `POST /add` | **explicit rule: nonce, 60 s / 180 s** | write 300/60 | `system:storage:add` |
| `PUT /edit` | **explicit rule: nonce, 60 s / 180 s** | write 300/60 | `system:storage:edit` |
| `DELETE /remove` | **explicit rule: nonce, 60 s / 180 s** | write 300/60 | `system:storage:remove` |
| `POST /upload` | default write nonce (120 s / 300 s) | `user` **30 / 60 s** | `system:file:upload` |

Tenant isolation: writes use `requireTenantId()` (fail-closed); `tenant_id` is injected
server-side by `buildStorageValues` and never taken from the body.

---

## 5. Frontend-only validation

- `storageName` / `storageType` required by the form.
- JSON textareas are stringified before submit.

## 6. Backend-only rules

- Zod length caps and enum validation (`storageCreateSchema`).
- `configJson` / `policyJson` must be valid JSON.
- Default-flag uniqueness per tenant.
- Tenant visibility on update/delete.

---

## 7. Known gaps / discrepancies

1. **No "test connection"** action — there is no way to verify credentials from the UI or API.
2. **Non-MinIO providers are stubs**: configuring `aliyun_oss` / `tencent_cos` / `aws_s3` records
   metadata but never stores an object. `qiniu_kodo` and `huawei_obs` appear in the type unions but
   fall back to `LocalProvider`.
3. **`GET /api/system/storage/file/:fileId/download`** returns the DB row as JSON instead of
   streaming the file or issuing a presigned URL. The File Manager opens it in a new tab, so the
   user sees JSON. This is a real bug — see `pages/file-config-files.md`.
4. Delete does not check whether files still reference the storage backend
   (`sys_file.storage_id`), so a storage config can be deleted while files point to it.
5. `system:storage:import/export/status` permissions are declared but unused.
6. `sys_storage_type` is referenced by the page config but is **not seeded** in `sql/Init.sql`,
   so the storage-type select can be empty until a dictionary is added.

---

## 8. How to extend

- **Add a provider**: implement `StorageProvider` in
  `bls-server/src/api/system/storage/providers/` (upload, remove, getPublicUrl, getPrivateUrl,
  optional ensureBucket), register it in `storage.factory.ts`, and seed the corresponding
  `sys_storage_type` dictionary value.
- **Add test connection**: implement `POST /api/system/storage/test-connection` that builds the
  provider from the (possibly unsaved) config and calls `ensureBucket`/a head request; gate it
  with `system:storage:edit` and add a rate-limit rule.
- **Make delete safe**: count `sys_file WHERE storage_id = ? AND deleted = 0` and return a
  `ConflictError` when files still reference the backend.
- **Fix the download endpoint**: stream the object (or return a presigned URL) instead of the DB
  row.
- Update this document.
