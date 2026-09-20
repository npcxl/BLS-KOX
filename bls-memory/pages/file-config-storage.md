# Page — Storage Configuration (`/file-config/storage`)

> **Document version:** 1.1.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/file-config/storage` (name 存储配置, parent 文件中心) |
| Component | `bls-admin/src/pages/system/file-config/storage/index.tsx` (`StoragePage`) |
| Purpose | CRUD of object-storage backends (`sys_storage_config`) per tenant; choose the default backend |
| Backend module | `bls-server/src/api/system/storage/index.ts` |
| Tables | `sys_storage_config` (main), plus `sys_file`, `sys_upload_audit` for uploads |
| Shared docs | `00-common/01-redis.md` (upload lock), `02-replay-protection.md`, `06-file-and-excel-security.md` |
| Environment strategy | Test/self-hosted = **MinIO**; production = **Aliyun OSS / Tencent COS / AWS S3 + CDN**, switched per tenant (i.e. per access domain) — see **Appendix A** |

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
toolbar. Its `permissions` prop declares only
`{import:'system:storage:import', export:'system:storage:export', create:'system:storage:add',
edit:'system:storage:edit', remove:'system:storage:remove'}` — none of which is actually
enforced, because `ExcelToolbar` is not rendered and the backend module only checks `jwtAuth` +
`hasPerm`.

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
5. The frontend declares `system:storage:import/export` but nothing enforces them (no Excel
   toolbar is rendered and the shared Excel module only checks `jwtAuth`). A `status` permission
   key was removed from the page on 2026-09-20 together with the disabled status toggle.
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

---

## Appendix A — Environment strategy: MinIO (test environment) vs OSS / CDN (production)

> Requirement in one line: **test uses MinIO; production switches to Aliyun OSS or another
> CDN-backed resource bucket, selected by which user/domain is accessing the system.**

### A.1 The switching model — how "switch by user access" works today

The storage backend is **per tenant**, and the tenant is resolved from the **access domain at
login** (`sys_tenant.domain_name` → tenant, see `pages/user-login.md` §3). At upload time
`handleUpload` picks the tenant's storage row:

```
request domain
   └─> sys_tenant.domain_name  → tenant_id
          └─> sys_storage_config WHERE tenant_id = ? AND deleted = 0
                 ├─ by explicit storageId, else
                 ├─ the row with is_default = '1', else
                 └─ the earliest row by create_time
                        └─> createStorageProvider(config)   (storage.factory.ts)
```

So **per-customer / per-environment storage switching needs no code change** — each tenant (each
domain) simply owns a `sys_storage_config` row pointing at its own bucket/CDN. What it does need
is a real provider implementation for the non-MinIO types (see A.3).

### A.2 Configuration per environment

| Environment | `storage_type` | Endpoint / region | `use_ssl` / `port` | Buckets | `public_base_url` |
|---|---|---|---|---|---|
| Dev / Docker / test | `minio` | `minio` (docker service), region `NULL` | `0` / `9000` | `public-assets` / `private-assets` | `/files` (proxied by nginx) |
| Production — Aliyun OSS | `aliyun_oss` | `oss-cn-hangzhou.aliyuncs.com`, region `cn-hangzhou` | `1` / `443` | e.g. `bls-public` / `bls-private` | `https://cdn.example.com` |
| Production — Tencent COS | `tencent_cos` | `cos.ap-guangzhou.myqcloud.com`, region `ap-guangzhou` | `1` / `443` | … | `https://cdn.example.com` |
| Production — AWS S3 (or S3-compatible) | `aws_s3` | `s3.ap-southeast-1.amazonaws.com`, region `ap-southeast-1` | `1` / `443` | … | `https://cdn.example.com` |

Seeded test row (for reference) — `sql/Init.sql`, `sys_storage_config`:

```sql
('000001','000000','MinIO 对象存储','minio','minio',NULL,9000,0,'minioadmin','minioadmin',
 'public-assets','private-assets','/files',NULL,1, ... ,1,0,'Docker内置MinIO，生产请修改', ...)
```

Steps to switch one environment (per tenant):

1. Open `/file-config/storage` → **新增** (or insert a `sys_storage_config` row) and fill
   `storageName`, `storageType`, `endpoint`, `region`, `port`, `useSsl=1`, `accessKey`,
   `secretKey`, `publicBucket`, `privateBucket`.
2. Set `publicBaseUrl` to the **CDN domain** (no trailing slash). This is the field both
   `MinioProvider` and the OSS/S3/COS stubs use first when building a public URL, so pointing it
   at a CDN is already supported.
3. Toggle **是否默认** (`isDefault`) on the new row — `applyDefaultFlag` keeps at most one default
   per tenant and clears the others in the same transaction.
4. Re-upload or migrate existing objects; existing `sys_file.url` values still point at the old
   backend.

### A.3 Blocker: non-MinIO providers are stubs (must be implemented first)

`AliyunOssProvider` / `TencentCosProvider` / `AwsS3Provider` / `LocalProvider` currently:

| Method | Stub behaviour |
|---|---|
| `upload()` | returns `{bucketName, objectName}` **without any network call** — nothing is persisted |
| `remove()` | no-op |
| `getPublicUrl()` | builds a string (honours `publicBaseUrl`, so CDN URLs are correct) |
| `getPrivateUrl()` | returns the **same public URL** — no signing |

`MinioProvider` is the only real implementation (`putObject`, `removeObject`, `bucketExists` /
`makeBucket`, `presignedGetObject` for private URLs).

Consequence: configuring an OSS row today makes uploads **appear to succeed** (a `sys_file` row is
written, a URL is generated) while **no object is stored**. Do not point production at OSS before
implementing the provider.

Implementation checklist:

1. Add the SDK to `bls-server/package.json` — `ali-oss` (OSS), `cos-nodejs-sdk-v5` (COS),
   `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3).
2. Implement `upload` / `remove` / `ensureBucket?` / `getPrivateUrl` in the provider, keeping
   `getPublicUrl` honouring `config.publicBaseUrl` (CDN) and falling back to
   `endpoint/bucket/object`.
3. Keep the `StorageProvider` interface and the `storage.factory.ts` switch unchanged; the
   upload flow in `api/system/storage/index.ts` needs no change.
4. Use `config.configJson` for provider-specific extras (custom domain, STS token, CDN auth
   signature) — the column is already stored and passed into `StorageConfig`.
5. Add unit tests in the style of
   `bls-server/src/api/system/storage/__tests__/storage.test.ts` (mock the SDK, assert the
   upload key/bucket/headers and the presigned URL).
6. Seed a `sys_storage_type` dictionary entry for the new type (`sys_storage_type` is referenced
   by the page config but is **not seeded** today).
7. Update this appendix + `CHANGELOG.md`.

### A.4 CDN notes

- **Public files** already produce a CDN-friendly URL: `accessType=public` →
  `provider.getPublicUrl()` → `publicBaseUrl` + `/{moduleName}/{uuid}{ext}`. Point
  `public_base_url` at the CDN and map the CDN origin to the bucket root; the object key layout
  (uploaded by `generateObjectKey`, see `00-common/06-file-and-excel-security.md`) is already a
  flat `moduleName/uuid.ext`, so no rewrite rule is needed beyond stripping the origin prefix.
- **Private files** have no CDN story: they must be served by a presigned URL
  (`MinioProvider.getPrivateUrl`, default 300 s). `private_base_url` is **stored but never read
  by any provider** — a CDN with signed URLs would require implementing it.
- **nginx `/files/` is MinIO-only**: `nginx.conf` hardcodes
  `location /files/ { proxy_pass http://minio:9000/public-assets/; }`. It is what makes the
  seeded `public_base_url = /files` work in Docker/test. With a real CDN you either
  (a) let clients hit the CDN directly (recommended, and what `public_base_url` is for), or
  (b) repoint `/files/` at the CDN if you must keep a single origin.
- **Env vars do not configure app storage**: `MINIO_USER` / `MINIO_PASSWORD` in
  `.env.docker.example` only provision the MinIO **container**. The application always reads
  storage settings from `sys_storage_config` — there is no `STORAGE_*` env bootstrap. If you want
  a zero-DB-row bootstrap (e.g. a fresh production deploy before anyone logs in), add one and
  document it here.

### A.5 Fields that look configurable but are not wired up

| Field | Reality |
|---|---|
| `policy_json` (`maxSizeMB`, `allowedExt`, `blockedExt`, `privateExpireSeconds`) | Stored, passed into `StorageConfig`, **read by nothing**. The real size limit comes from `sys_config.sys.upload.maxSize` (`getDynamicConfig().uploadLimitMB`), and the extension/MIME whitelist is hardcoded in `security/file-security.ts`. |
| `private_base_url` | Stored, **never read** (see A.4). |
| `config_json` | Stored and passed to the provider; unused by the MinIO provider, intended for the SDK-based providers. |
| `region` / `port` / `use_ssl` / `path_style` | Used by `MinioProvider` (`use_ssl`, `port`, `path_style`, `region` for bucket creation). Honour them the same way in new providers. |

### A.6 Recommended production setup (summary)

| Concern | Recommendation |
|---|---|
| Test environment | Keep the seeded MinIO row (`000001`, tenant `000000`) — zero setup. |
| Production platform tenant | One `aliyun_oss` (or COS/S3) row, `is_default = 1`, `public_base_url` = CDN domain. |
| Per-customer isolation | Give each tenant its own row (own bucket, own CDN host or path); switching is by access domain → tenant, no code change. |
| Private assets | Keep `private_bucket` separate from `public_bucket`; rely on presigned URLs (implement for OSS/S3, MinIO already works). |
| Verification | There is no "test connection" action yet (gap #1) — implement `POST /api/system/storage/test-connection` before going live. |
