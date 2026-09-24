# Page — Personal Settings (`/account/settings`)

> **Document version:** 1.1.0 · **Code version:** 1.0.0 · **Verified commit:** efcf8a5 · **Last verified:** 2026-09-24
>
> *Uncommitted note:* the change-password section was re-checked against `efcf8a5` **plus uncommitted
> changes** to `bls-server/src/api/system/user/index.ts` + `shared/utils/password.ts` (canonical
> password form fix).

## 1. Summary

| Item | Value |
|---|---|
| Route | `/account/settings` (`/account` redirects here) |
| Component | `bls-admin/src/pages/account/settings/index.tsx` + `components/{base,security,binding,notification}.tsx` |
| Purpose | Current user profile edit, avatar upload, password change; binding + notification tabs are static UI |
| Backend modules | `bls-server/src/api/auth/index.ts` (`profile`), `bls-server/src/api/system/user/index.ts` (`/profile`, `/changePassword`), `bls-server/src/api/system/storage/index.ts` (`/upload`) |
| Menu permission | none (self-service) |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `06-file-and-excel-security.md` |

Four tabs: `base` (基本设置), `security` (安全设置), `binding` (账号绑定),
`notification` (新消息通知).

---

## 2. Frontend → API map

| User action | Service function / call | Method | Endpoint |
|---|---|---|---|
| Load current user (base + security tabs) | `queryCurrent()` → `currentUser()` (`pages/account/settings/service.ts` → `services/ant-design-pro/api.ts`) | GET | `/api/auth/profile` |
| Save profile (nickname / email / phone) | `updateProfile` (`services/system/user.ts`) | PUT | `/api/system/user/profile` |
| Change avatar | `useFileUpload` (`hooks/useFileUpload.ts`) | POST | `/api/system/storage/upload` (multipart, `accessType=public`, `moduleName=avatar`) |
| Persist the new avatar URL | `updateProfile({userId:'', avatar: result.url})` | PUT | `/api/system/user/profile` |
| Change password | inline `request(...)` in `components/security.tsx` | PUT | `/api/system/user/changePassword` |
| Binding tab (Taobao / Alipay / DingTalk) | static list, `<a href="#">绑定</a>` | — | **no API** |
| Notification tab toggles | static `<Switch defaultChecked>` | — | **no API**, not persisted |

After a successful profile update, `base.tsx` calls `fetchUserInfo()` (from `@@initialState`)
and `queryClient.invalidateQueries(['current-user'])`.

---

## 3. Backend endpoints

### `GET /api/auth/profile`

- Auth: `jwtAuth()`. Handler: `profile` in `bls-server/src/api/auth/index.ts`.
- Returns `sys_user` fields + `permissions` + `perms` + `roles[{roleKey,dataScope}]` + `menus`
  (tree). Throws `UnauthorizedError('用户不存在')` if the user row is gone.

### `PUT /api/system/user/profile`

- Auth: `jwtAuth()` only — **no `hasPerm`**.
- Handler: `PUT /profile` in `bls-server/src/api/system/user/index.ts`.
- Whitelist `USER_PROFILE_FIELDS` (`bls-server/src/shared/utils/mass-assignment.ts`):
  `nickname, avatar, email, phone, gender, remark`.
  - `realName` is **not** updatable here.
  - `body.userId` is ignored — the JWT `userId` is used.
- Updates `sys_user WHERE user_id = ctx.state.user.userId AND tenant_id = <jwt tenant> AND deleted = 0`.
- Empty payload → `ValidationError('没有可更新字段')`.
- No Zod schema; only whitelist filtering.

### `PUT /api/system/user/changePassword`

- Auth: `jwtAuth()` only. Handler in the same module.
- Zod `passwordSchema`: `oldPassword` 1–100, `newPassword` 6–100.
- Loads `password` + `password_algorithm` for `user_id AND tenant_id AND deleted=0`.
- ⚠ **This page sends the passwords as PLAINTEXT** (`components/security.tsx` — unlike the login
  form, which MD5s client-side). `verifyPassword(oldPassword, hash, algorithm)` normalises the input
  (`normalizePasswordInput` → MD5) before the Argon2 check, so plaintext and MD5 inputs both work
  against the canonical `argon2id(md5(password))`. Mismatch → `ValidationError('旧密码不正确')`.
- Re-hashes with `hashPasswordCanonical(newPassword)` (`argon2id(md5(newPassword))`) and sets
  `password_algorithm='argon2id'` — a wrong form here would lock the user out at the next login,
  because login always submits `md5(password)`.
- **`sessionCenter.revokeAll(tenantId, userId)`** — this invalidates every active session
  (including the current one) because `jwtAuth()` validates the session on every request.
- Writes a `PERM_CHANGE` security log with the title `修改密码`.

### `POST /api/system/storage/upload` (avatar)

See `00-common/06-file-and-excel-security.md`. Overrides used by this page:
`accessType=public`, `moduleName=avatar`. Returns `{fileId, url, ...}`; only the public URL is
persisted into `sys_user.avatar`.

Tables touched: `sys_user`, `sys_user_role`, `sys_role`, `sys_menu`, `sys_role_menu`, `sys_file`,
`sys_upload_audit`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /api/auth/profile` | off | read 600/60 | JWT only |
| `PUT /api/system/user/profile` | default write nonce (120 s / 300 s) | write 300/60 | JWT only |
| `PUT /api/system/user/changePassword` | default write nonce | write 300/60 | JWT only |
| `POST /api/system/storage/upload` | default write nonce | `user` **30 / 60 s** | `system:file:upload` |

Both write endpoints are scoped by `user_id AND tenant_id` from the JWT — a user can only ever
modify their own row. Password change revokes all sessions (Redis / Session Center), which is the
reason the UI message says "请重新登录".

---

## 5. Frontend-only validation

- Base tab: `nickname` required; avatar must be an image (upload validation is server-side).
- Security tab: `newPassword` min length 6 and must equal the confirm field; on success it shows
  `密码修改成功，请重新登录` but does **not** force a logout or redirect.
- Binding / notification tabs are decorative.

---

## 6. Known gaps / discrepancies

1. The change-password success handler does not call `redirectToLogin()`. Because the backend
   revokes all sessions, the next request will 401 — the user experience depends on the global
   401 handler.
2. `realName` cannot be edited even though it is displayed.
3. Binding and notification tabs have no backend at all (no tables, no endpoints).
4. The avatar upload sets `accessType=public`; ensure the storage config has a public bucket,
   otherwise the URL will not be retrievable.

---

## 7. How to extend

- **Allow editing `realName`**: add it to `USER_PROFILE_FIELDS` and re-check the mass-assignment
  whitelist.
- **Force re-login after password change**: call `resetSession()` + `redirectToLogin()` in
  `components/security.tsx` on success.
- **Persist notification preferences**: create a `sys_user_notification` table + a CRUD module,
  then wire the switches. Add the corresponding permission codes.
- **Real account binding**: create a `sys_user_binding` table and dedicated OAuth endpoints
  (remember to add rate limits + replay rules for any new write endpoint).
- Update this document and `00-common/*` after the change.
