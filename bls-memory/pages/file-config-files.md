# Page — File Manager (`/file-config/files`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/file-config/files` (name 文件管理, parent 文件中心) |
| Component | `bls-admin/src/pages/system/file-config/files/index.tsx` (`FilePageInner`) |
| Purpose | List / inspect uploaded files, upload new files, preview images, copy public URL, download, delete |
| Backend module | `bls-server/src/api/system/storage/index.ts` |
| Table | `sys_file` (+ `sys_upload_audit` on upload) |
| Shared docs | `00-common/01-redis.md`, `02-replay-protection.md`, `06-file-and-excel-security.md` |

---

## 2. Frontend → API map

Resource: `{ basePath:'/api/system/storage', list:'/files', add:false, edit:false,
remove:'/files/remove', status:false }`. `showCreateButton={false}`, `showRemoveAction={false}`.

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search (`originalName`, `moduleName` LIKE; `accessType` =) | `listResource` via `useCrudTable` | GET | `/api/system/storage/files` |
| Upload (button or drag & drop) | `useFileUpload({uploadUrl})` via `FileUploadModal` | POST multipart (`file`, `accessType`, `moduleName`) | `/api/system/storage/upload` |
| Preview image | browser renders `record.url` | GET | `record.url` (static/external) |
| Copy public URL | `copyText` (`navigator.clipboard`) — no API | — | — |
| Download (row 下载) | builds `<a href="/api/system/storage/file/{fileId}/download" target="_blank">` (native navigation, not XHR) | GET | `/api/system/storage/file/{fileId}/download` |
| Delete single (row Popconfirm) | inline `request` | DELETE | `/api/system/storage/file/{fileId}` |
| Batch delete | `removeResource` | DELETE | `/api/system/storage/files/remove` (body `{ids}`, query `ids=a,b`) |
| Columns | `usePageConfig('file_manager')` | GET | `/api/system/page-config/page/file_manager/columns` |
| Dict | `useDict('sys_bucket_access_type')` | GET | `/api/system/dict/data/type?dictType=sys_bucket_access_type` |

`formColumns` (`moduleName`, `accessType`) exist but are unused because `add`/`edit` are disabled.

---

## 3. Backend endpoints

Same module as the storage page (`prefix: '/system/storage'`).

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/files` | `system:file:list` | `getCurrentTenantId()`, `deleted=0 AND tenant_id=?`; `originalName`/`moduleName` LIKE, `accessType` =; pagination; `ORDER BY create_time DESC`; returns `{code:200, data, total}` (camelised by `wrapCamel`) |
| DELETE | `/files/remove` | `system:file:remove` | Reads `body.ids` (array → String); empty → `{code:400, message:'缺少 ids'}`; soft delete `WHERE file_id IN (...) AND tenant_id = tid` (**no per-id visibility pre-check**) |
| DELETE | `/file/:fileId` | `system:file:remove` | `assertTenantResource('sys_file','file_id',fileId)` then soft delete scoped by tenant |
| GET | `/file/:fileId/url` | `system:file:download` | Returns the `sys_file` row scoped tenant + `deleted=0` |
| GET | `/file/:fileId/download` | `system:file:download` | Returns the `sys_file` row (⚠ see §7) |
| POST | `/upload` | `system:file:upload` | Full pipeline in `00-common/06-file-and-excel-security.md` |

`sys_file` columns: `file_id` (PK), `tenant_id`, `storage_id`, `bucket_name`, `object_name`,
`original_name`, `file_name`, `file_ext`, `mime_type`, `file_size`, `access_type`
(default `private`), `module_name`, `url`, `create_*`, `update_*`, `deleted`.

Upload returns `{fileId, url, bucketName, objectName, originalName, fileName, fileSize}`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /files` | off | read 600/60 | `system:file:list` |
| `POST /upload` | default write nonce (120 s / 300 s) | `user` **30 / 60 s** | `system:file:upload` |
| `DELETE /files/remove` | default write nonce | write 300/60 | `system:file:remove` |
| `DELETE /file/:fileId` | default write nonce | write 300/60 | `system:file:remove` |
| `GET /file/:fileId/url`, `/download` | off | read 600/60 | `system:file:download` |

Tenant isolation: all file endpoints scope by `tenant_id`; the single-file delete additionally
uses `assertTenantResource` (404 when the file belongs to another tenant). Upload is fail-closed
on a missing tenant.

Upload security (extensions, MIME, magic numbers, size, module name, object key) is described in
`00-common/06-file-and-excel-security.md`.

---

## 5. Frontend-only validation

- Upload modal restricts file types and size client-side (server re-validates everything).
- Image preview only for image MIME types.

## 6. Backend-only rules

- Extension + MIME + magic-number consistency.
- Dynamic size limit (`uploadLimitMB`, default 20 MB, max 500 MB; hard default 100 MB).
- Module-name regex; `accessType ∈ {public, private}`.
- Tenant ownership on single-file delete.

---

## 7. Known gaps / discrepancies

1. **Download is broken**: `GET /api/system/storage/file/:fileId/download` returns the `sys_file`
   DB row as JSON instead of streaming bytes or returning a presigned URL. Clicking 下载 opens a
   JSON page. Fix the handler to use `provider.getPrivateUrl(...)` / `getPublicUrl(...)` and
   redirect, or stream the object.
2. **`GET /file/:fileId/url`** also returns the row (not a URL) — the field is inside `data.url`.
3. **Batch delete has no per-id visibility pre-check** (unlike the storage `/remove`); it relies on
   the tenant WHERE clause. A mixed-tenant id list silently deletes only the visible rows.
4. Frontend declares `system:file:add/edit/status/import/export` permissions that have no backend
   route.
5. `sys_bucket_access_type` is referenced by the page config but is **not seeded** in
   `sql/Init.sql`, so the access-type select may be empty.
6. Delete does not remove the object from the storage backend — only the DB row is soft-deleted
   (the provider `remove` is never called from this page).

---

## 8. How to extend

- **Fix download**: change `GET /file/:fileId/download` to return
  `{ url: await provider.getPrivateUrl(objectName, expires) }` (or a 302 redirect), and update the
  frontend to `window.open(data.url)`.
- **Add hard delete**: implement an option that also calls `provider.remove(bucket, objectName)`,
  and write a security log.
- **Add per-id visibility check** to `/files/remove` (mirror the storage `/remove` pattern).
- **Add an upload-audit view**: surface `sys_upload_audit` rows (already written by the upload
  flow) via `/api/system/log/upload`.
- Update this document.
