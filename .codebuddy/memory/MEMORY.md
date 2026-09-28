# BLS-KOX — Long-term Memory (cross-session)

> Stable, cross-session facts only. Day-to-day detail goes into `YYYY-MM-DD.md`.
> Last consolidated: 2026-09-28 (compressed after size-limit truncation; captcha merged 2026-09-21/22).

## I. Environment & tooling gotchas

- Default `node` is v16; the project needs **≥22**: `C:\Users\18569\.workbuddy\binaries\node\versions\22.22.2\node.exe`
  (prepend its dir to `PATH`).
- JDK 21 at `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`; default `mvn` runs JDK 8 → set `JAVA_HOME`.
  `bls-java-server` deps cannot be fetched here (Maven Central unreachable, `io.jsonwebtoken:jjwt-bom:0.12.6`
  missing) → `mvn compile/test` fails.
- **IDE tool file writes can silently produce a 0-byte file** — bit us with `bls-server/migrations/*.sql`
  (committed empty in `753d86a`) and twice with `tmp-deploy.py`. Always verify size / `git status` afterwards;
  never trust the success message.
- **ALTCHA (login captcha layer 1) needs a secure context** — WebCrypto PoW hard-throws
  `Secure context (HTTPS) required.` when `!globalThis.isSecureContext` (no bypass). `https://…`,
  `http://localhost`, `http://127.0.0.1` work; `http://<LAN-IP>:3000` is blocked server-side. Reported as
  `envBlocked` / `ENV_UNSUPPORTED`. Production must be HTTPS.
- **BuildKit ignores `registry-mirrors` from `/etc/docker/daemon.json`** (only `docker pull` honours it) and
  Compose v2 always uses BuildKit ⇒ `docker compose build` resolves base images against docker.io directly
  (times out in CN). Fixes: pre-`docker pull`; point `FROM` at a **prefix-capable** mirror
  (`docker.1ms.run/library/node:22-alpine`; ⚠ `<id>.mirror.aliyuncs.com/library/…` 404s — daemon-mirror only);
  or give BuildKit `[registry."docker.io"] mirrors=[…]` via `docker buildx create --config …`.
- PowerShell caveats: `Get-Content`/`Select-String` decode as ANSI (UTF-8 Chinese → mojibake; judge by
  `git diff`); `node -e "…"` swallows quotes and treats the backtick as an escape char (a SQL-backtick regex
  matches nothing — use a temp `.js` file or `[\x60]`); `findstr` piped into another command fails. Prefer Node
  scripts or the IDE search tools.
- Rust sources repaired 2026-09-20: literal `?` (`0x3F`) had replaced 96 Chinese strings in
  `bls-rust-server/src/**/*.rs` (1:1 restore from the Koa text; clean at `d6785e0`), plus 10 pagination `count`
  queries that swallowed DB errors (`unwrap_or(0)` → `.map_err(AppError::from)?`).
- **`bls-server` dependency self-check** — one registry `src/observability/service-health.ts` (`SERVICE_DEPS`)
  drives the boot report, `GET /api/ready`, `GET /internal/services`, the watchdog and
  `npm run services:check`. Exactly **6** deps: mysql/redis (**core** = the only fatal ones), Koa's own
  `bls-realtime-ws` (conditional, WS handshake probe — shares the HTTP port, so the report prints **right after**
  `server.listen`), event-service/ai-service (optional, `EVENT_SERVICE_URL` / `AI_SERVICE_URL`),
  captcha-service (conditional, `TIANAI_BASE_URL`). Unset URL → `[SKIP]`, not `[FAIL]`;
  `SERVICE_CHECK_STRICT` (prod default true) refuses to boot on a down core dep. Keep `warmup` (dynamic imports /
  pool init) **outside** the timed probe (a cold `import('kysely')` was misreported as "service down"). Report =
  one table, no summary/hints, CJK-width aware, TTY-only colour. **Java/Rust backends are drop-in alternatives,
  not dependencies — the user explicitly rejected listing them**; same for MinIO (no Koa config source, port 9000
  collides with the dev server) and `ollama` (the AI service's own dep). ⇒ minimal deployment = `mysql + redis + bls-server`.
- **Never start a temporary `bls-server` on port 6001** to "test the boot" — it races the user's `tsx watch` child
  (`EADDRINUSE on WebSocketServer`). Use `APP_PORT=6009 npx tsx src/app.ts`, then kill the exact new node PIDs
  (diff before/after) — never by process name.

## II. Login captcha — unified ticket model (merged 2026-09-21/22)

Server decides everything; the browser only talks to Koa (the Java Tianai service is never exposed).
Layer 1 = ALTCHA invisible Proof-of-Work; layer 2 = **Tianai** (`blockPuzzle` / `clickWord`, a separate Java
service proxied by Koa). ALTCHA's `display="standard"` widget is **not** a second layer.

- `GET /api/captcha/config` → `{enabled, primaryProvider, fallbackProvider, tianaiEnabled, generateUrl,
  verifyUrl, fieldName}` (uppercase `ALTCHA`/`TIANAI`; no thresholds, no policy reasons).
  `POST /api/captcha/generate` → `{provider, challenge, sessionId?, expiresAt}`.
  `POST /api/captcha/verify` → `{status:'passed'|'failed'|'technical_error', provider, captchaTicket?,
  expiresAt?, reason?, requireFallback?, nextProvider?, escalationGrant?, escalationExpiresAt?}`.
  `requiredStage` and `mode` were deleted.
- **`POST /api/auth/login` only accepts `captchaTicket`** (`captcha:ticket:{sha256(ticket)}`, GETDEL one-shot) and
  never trusts a provider result directly; `captchaToken` is the old name. Redis keys and used-markers only ever
  contain `sha256(ticket)`.
- The frontend may send only `scene` / `provider` (intent) / `username` / `payload` (ALTCHA) / `sessionId` + `data`
  (Tianai) / `escalationGrant`; ticket contents and the verdict are server-decided.
- **Layer 2 is gated by a one-shot escalation grant** (`captcha:escalation:{sha256(grant)}`): only `/captcha/verify`
  issues it (and only when the risk policy escalates); `/captcha/generate?provider=TIANAI` must consume it (GETDEL)
  or get `40011`.
- `captcha_tianai_enabled=false` (default) = no layer 2, risk hits are only *noted* (`CAPTCHA_RISK_NOTED`, LOW).
  `=true` = a risk hit **must** complete Tianai; if the service cannot run (no `TIANAI_BASE_URL`, failed health
  check, timeout) → **fail closed 50302**. It must NEVER silently downgrade a high-risk account to
  "ALTCHA only + ticket" (that was a real security bug).
- Health check accepts **only 2xx + a parseable JSON object**; on an upstream technical failure the response carries
  a **fresh** `escalationGrant` so the browser auto-refetches the challenge.
- The layer-2 payload is the **official Tianai `ImageCaptchaTrack` DTO**
  (`bgImageWidth/bgImageHeight/templateImageWidth/templateImageHeight/startTime/stopTime/trackList[{x,y,t,type}]`,
  `type ∈ DOWN|MOVE|UP|CLICK`). Sizes come only from the upstream response — no `randomY`, no 320×160 fallback.
- `CAPTCHA_SECONDARY_REQUIRED` (escalated → no ticket) and `CAPTCHA_RISK_NOTED` (noted only → the request still
  passes) are **mutually exclusive** within one `/verify` call.
- `POST /api/system/config/batch` saves the 8 flat captcha keys atomically (whitelist + single transaction) and
  health-checks Tianai **before** committing.
- **Gotcha that cost hours:** the ALTCHA branch of `service.ts` must read the challenge nonce from the **decoded**
  payload — `meta.payload` is a base64 **string**, so `challengeNonceOf(meta.payload.challenge)` is always empty and
  turns a *successful* PoW into `PAYLOAD_MALFORMED` ("人机验证数据无效"). The provider now returns `challengeNonce`;
  never re-derive it from the raw body. A provider-side exception (`VERIFY_ERROR`) must be `technical_error`.
- **NEVER self-implement captcha algorithms** (user rule, 2026-09-21): no slider, no image slicing, no trajectory
  recognition, no custom maths, no browser fingerprinting — integrate a mature open-source project (here:
  self-hosted ALTCHA, npm `altcha` v3, Koa-only, `bls-server/src/security/captcha/*`). Self-hosted ALTCHA has **no
  image/audio challenge**; a picture puzzle means running Tianai separately and letting Koa proxy it (never port the
  Java algorithm to TS).
- ALTCHA widget tip: its `challenge` attribute accepts a **JSON string** (parsed when it starts with `{`, no fetch)
  — that is how the frontend feeds Koa's `/generate` result to it. The bundle creates its PoW Web Worker from an
  inline `data:` URL → frontend CSP needs **`worker-src 'self' blob: data:`** (`bls-admin-nginx.conf` updated).
- Tianai (Java) config prefix is **`captcha`** (not `tianai.captcha`), `init-default-resource: true` is required,
  and the built-in resources contain **templates + font only, no background image**, which must be registered
  manually (`CaptchaResourceInitializer`).
- **ESM-only npm dep from this CommonJS backend**: `altcha` is `"type":"module"` → a static `import` gives TS1479,
  a type-only import TS1541/TS1542. Load it with a **lazy dynamic `import()`** (cached promise) and declare the
  needed data shapes locally.
- **Router scan convention**: `src/core/router.ts` recurses into sub-directories **even when the parent has an
  `index.ts`** — that is how `api/auth/index.ts` (function routes) and `api/auth/captcha/index.ts` (custom router)
  coexist. A nested custom module must put the full path after `/api` in its own `new Router({ prefix: '/x/y' })`.
- Config = **8 flat keys only**: `login_captcha_enabled`, `captcha_primary_provider`, `captcha_fallback_provider`,
  `captcha_ticket_ttl`, `captcha_tianai_enabled`, `captcha_challenge_ttl`, `captcha_force_after_failures`,
  `captcha_secondary_type`. Old `sys.login.captcha.*` is no longer read at runtime (migration `20260922_018`).
  Env: `ALTCHA_HMAC_KEY` (prod required), `ALTCHA_COST`, `TIANAI_BASE_URL`, `CAPTCHA_DEV_BYPASS`.
- Full memory: `bls-memory/pages/login-captcha.md`; also `docs/login-captcha.md`.

## III. Project conventions (follow when changing code)

- **Deployment topology (2026-09-24)**: production `47.94.205.207` (Aliyun, `xlcig.cn`) runs **only `bls-server`**;
  MySQL + Redis live on an external host `117.72.118.165` (DB `kox`), so the `mysql`/`redis` containers must never
  be started there. ⚠ The **local dev `bls-server/.env` points at the very same instance**
  (`117.72.118.165:3306/kox`, Redis `:6379`) → dev and production **share one database and one Redis**; the correct
  `DB_PASSWORD`/`REDIS_PASSWORD` are already in that file (copy them, never regenerate). Consequences:
  - `bls-server` has `depends_on: mysql(healthy)/redis(healthy)`, so `up -d bls-server` starts those containers too
    — always pass `--no-deps`.
  - `REDIS_KEY_PREFIX` defaults to `bls:` ⇒ if prod and dev share that Redis, keys collide (sessions, rate-limit
    counters, replay nonces, captcha tickets) → give prod a distinct prefix.
  - ⚠ **`environment:` in the compose files is an explicit allow-list** — `REDIS_KEY_PREFIX`, `AI_SERVICE_URL`,
    `TIANAI_BASE_URL`, `REDIS_USERNAME`, `PUBLIC_IP` appear in **no** `docker-compose*.yml`, so writing them into
    `.env.docker` has **zero effect**. Add them to the service's `environment:` list (or an override file). Verify
    with `docker compose config | grep <VAR>`.
- **Captcha (Tianai) container wiring trap**: `docker-compose.captcha.host.yml` publishes 8083 on `127.0.0.1`, which
  only works when Koa runs **on the host** (`npm run dev`); for a containerised `bls-server`, `127.0.0.1` is the
  container itself. `docker-compose.captcha.yml` puts `tianai-captcha` on its own network `bls-captcha_net`.
- **`bls-event-service` is a separate Node service on `:7101`** (`cd bls-event-service && npm run dev`,
  `INTERNAL_SECRET` must match `bls-server/.env`). If down, `publishEvent` logs `event-service unreachable`,
  retries via the outbox and finally `[outbox] dead letter` — noisy but harmless.
- **`bls-admin` test setup**: `vitest.config.ts` + `vitest.setup.ts` (jsdom, `@testing-library/jest-dom`, RTL
  auto-cleanup, `globals: true`); `npm run test` runs the `*.test.tsx` files next to the code. Do **not** enable
  `restoreMocks` (some tests set their mock implementation once inside the `vi.mock` factory).
- **Backend is the source of truth for permission codes**; frontend `permissions` prop and the SQL seed must match
  `hasPerm('…')` exactly (common bug: `:create` vs `:add`). `ctx.state.user` exposes both `perms` and `permissions`.
- **Password contract (fixed 2026-09-24)**: canonical stored form is **`argon2id(md5(password))`**. Only the **login**
  form MD5s client-side (`services/ant-design-pro/api.ts`); changePassword / admin reset / forgot-password reset /
  tenant provisioning send **plaintext**. Every write goes through `hashPasswordCanonical()`, every check through
  `verifyPassword()` (normalises input, accepts either form, plus legacy `argon2id(plaintext)`; any
  `algorithm !== 'md5'`, including Java's `argon2`, takes the Argon2 branch). Writing `argon2id(plaintext)` makes an
  account that can **never** log in. Argon2 params: memoryCost 65536, timeCost 3, parallelism 4.
- Koa CRUD factory (`core/crud.ts` + `core/crud-config.ts`, declared with `defineCrudConfig`):
  - 6 endpoints: `GET /list`, `GET /:id`, `POST /add`, `PUT /edit`, `DELETE /remove`, `PUT /status`;
    `actions`-disabled endpoints are not registered.
  - `fields` is the single field source (derives create/update/search/filter whitelists, response projection, Zod
    schema, statusField); explicit arrays / `schema` win; legacy configs without `fields` keep old behaviour. An
    invalid config throws at route registration → the app fails to start.
  - Audit fields (`create_by`, `create_time`, `update_by`, `update_time`) are never writable from a request body —
    only via `createDefaults`; `select:false` fields are omitted from list/detail (projection always keeps the PK);
    system fields (PK, `tenant_id`, `deleted`, audit) never writable.
  - `applyScope()` builds tenant + soft-delete + Data Scope once; must be reused inside transactions. 0 affected
    rows on edit/remove/status/detail → 404.
  - Batch delete always takes `{ ids: [] }` (Koa/Java also accept a bare array / comma string).
- **Production env is hard-validated at startup** (`bls-server/src/config/env.ts`, only when `NODE_ENV=production`;
  a missing/wrong value **throws → the container crash-loops**): `JWT_SECRET` (not the
  `please_change_me_dev_only` fallback, not `CHANGE_TO_*`), `DB_PASSWORD`, `CORS_ORIGINS` (**non-empty, no `*`**),
  `API_SIGN_SECRET` (required whenever `REPLAY_ENABLED=true`), `ALTCHA_HMAC_KEY` (**≥32 chars**),
  `SECRET_ENCRYPTION_KEY`, `REDIS_ENABLED=true` (`CAPTCHA_DEV_BYPASS` refused in production).
  ⚠ `docker-compose.yml`'s explicit `environment:` list forwards only `CORS_ORIGINS` and `API_SIGN_SECRET` of those.
- **Envelope-encryption key vs a shared DB**: in dev `SECRET_ENCRYPTION_KEY` is absent and the key is
  HKDF-SHA256-derived from `JWT_SECRET` (salt `bls-kox-secret-envelope`, info `secret-encryption`, 32 B); ciphertext
  format `enc:v1:<keyVersion>:<iv>:<authTag>:<ct>` (`keyVersion` defaults to `v1`). Setting a *fresh*
  `SECRET_ENCRYPTION_KEY` while the version stays `v1` makes every existing `enc:v1:v1:…` row undecryptable. Against
  a DB that already holds such rows either reuse the derived value or rotate properly:
  `SECRET_ENCRYPTION_KEY_VERSION=v2` + `SECRET_ENCRYPTION_KEY_PREVIOUS=v1:<derived>` + `npm run secrets:rotate`.
- ⚠ **`LocalProvider` is a stub, not a real storage backend** (`api/system/storage/providers/LocalProvider.ts`):
  `upload()` only echoes `{bucketName, objectName}` and `getPublicUrl()` returns a URL nothing serves, so
  `sys_storage_config.storage_type='local'` makes uploads silently "succeed" and produce dead URLs. Only `minio`
  really works (aliyun_oss / tencent_cos / aws_s3 are stubs too); without MinIO or cloud OSS a deployment has **no
  working upload** (the seeded row points at `minio:9000` with `minioadmin`).
- Global tables (no `tenant_id`): `sys_menu`, `sys_package`, `sys_package_menu`, `sys_role_menu`, `sys_user_role`;
  of these `sys_menu`, `sys_package`, `sys_package_menu`, `sys_role_menu` have **no `deleted` column**.
- `tenant_id` of a multi-tenant table only comes from server-side request context; a request body can never override it.
- When changing page behaviour or an API, also update `docs/crud.md`, `docs/backend-koa.md`,
  `docs/api-compatibility.md` and `sql/Init.sql`.
- **SQL changes always ship in BOTH places** (user requirement, 2026-09-21): `sql/Init.sql` for **fresh installs**,
  `bls-server/migrations/YYYYMMDD_NNN_*.sql` for **already-deployed** DBs via `npm run db:migrate up`. Holds **even
  for pure seed data with no DDL** (reference: `20260922_017_login_captcha.sql` ↔ the 9 `sys.login.captcha.*` rows
  in `Init.sql`).
- Architecture quick reference: frontend `bls-admin` (UmiJS Max + Ant Design Pro 6, port 9000); main backend
  `bls-server` (Koa 3, 6001 / Docker 7001); `bls-ai-service` 7201; `bls-event-service` 7101. Java and Rust backends
  are **compatible alternatives** — only one backend runs at a time. Frontend bundler is **`utoopack`
  (`@utoopack/pack`), not mfsu/esbuild**; the schema has **no foreign-key constraints**; the platform tenant id is
  `'000000'`; business responses are `{code, message, data, total}` with `pageNum` / `pageSize` (max 100).
- **Ad-hoc deploy scripts stay local — never add them to the repo** (user, 2026-09-25): the push helper
  (`tmp-deploy.py`), `dist-upload.tgz` and build/test logs are session-scoped: write → use → delete (already in
  `.gitignore`). The shape that works from this Windows box:
  1. build locally (`cd bls-admin && npm run build`, or `tsc` for `bls-server`);
  2. upload artifacts — **Windows OpenSSH `ssh`/`scp` cannot take a password non-interactively**, so use
     **paramiko** (`python -m pip install --user paramiko`): ~30-line script with `--put local=remote` (SFTP) and
     `--cmd` (exec), password from `DEPLOY_PW`;
  3. on the server: `tar -xzf <pkg> -C bls-admin/` (never delete the `dist` **directory** — it is a bind mount),
     then `docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.server-only.yml up -d
     --no-deps --build <service>`;
  4. **tag the current image first** (`docker tag bls-kox-bls-server:latest …:pre-<change>`) for any auth/password
     change — rollback = re-tag `latest` + `up -d --no-deps`.
  Hard-won checks: the only reliable "frontend really deployed" proof is `grep -rl <new-literal> bls-admin/dist`;
  re-read files on the server instead of trusting `--put` output. `npm run build` (utoopack) also fails spuriously
  (`Unable to deserializate response from webpack loaders transform … missing field source`) — **just run it again**.

## IV. Documentation & memory system (most important convention)

- **`bls-memory/` is the single entry point for page-level memory**; repo-root `AGENTS.md` points at it.
  - `README.md` = page index + usage guide + version-metadata rules + page template.
  - `pages/*.md` = one file per page (frontend action → service fn → HTTP endpoint → backend handler & validation →
    permission codes → tenant isolation → replay/rate-limit → frontend-only validation → known gaps → extension steps).
  - `00-common/00..12-*.md` = 13 cross-cutting docs (architecture, redis, replay-protection, rate-limiting,
    auth-and-permissions, security-log-and-event-center, file-and-excel-security, database, external-api-and-service-auth,
    realtime-websocket, job-api-and-queue, frontend-shell, frontend-data-layer).
  - `CHANGELOG.md` = changelog of the document set.
- **After changing code you MUST sync memory**: update the memory doc → refresh the metadata line under its H1
  (`Document version` / `Code version` = repo-root `VERSION` / `Verified commit` / `Last verified`) → append to
  `bls-memory/CHANGELOG.md`. `Verified commit` records only commits that **changed application code**; docs-only
  commits (`bls-memory/`, `docs/`, `.codebuddy/`) do not invalidate verification. **Never re-stamp a document that
  was not actually re-read.** Uncommitted verified code → keep current HEAD + an "uncommitted" note.
- **Redis is documented once**: any new Redis key → namespace table in `00-common/01-redis.md`.
- **The database is documented once**: a new table/column → `00-common/07-database.md` + `sql/Init.sql` + a new file
  in `bls-server/migrations/`.
- `.codex/skills/bls-kox/references/database-schema.md` is **stale** (18 of 40 tables; `sys_job` → really
  `sys_jobs`, `sys_file_config` → really `sys_storage_config`). Schema authority =
  `00-common/07-database.md` + `sql/Init.sql`.
- Repo-root `README.md` keeps a short **"🧠 Memory"** section and stays **concise** (~176 lines); long-form content
  belongs in `docs/` and `bls-memory/`.

## V. Collaboration preferences

- Diagnose first, then give precise commands and explain their impact — never do sweeping destructive cleanups
  (a bulk force-remove command was rejected before).
- **Never run `git commit` unless explicitly asked.** When done, report the change list + a suggested commit message.
- Reply in Simplified Chinese; AI-facing documents (`bls-memory/`, `AGENTS.md`, this file) are English.
- **Deployment dependency preference (2026-09-24)**: the user is reluctant to depend on **CNB (Tencent)** as the
  build/registry pipeline — it is a third party to their own Aliyun server; they lean towards "git pull +
  `docker build` on my own server". Treat the CNB pipeline as optional: the compose files support both routes
  (`-f docker-compose.deploy.yml` = pull from the registry; without it = use the locally built image), and a
  self-contained server-side script (`git pull` → build → migrate → `up -d` → health check) is the preferred
  automation shape. If a registry is still desired, suggest their **own Aliyun ACR**.
- Several sessions may work in parallel here: check `git status` before editing, do not overwrite another session's
  uncommitted work, and call out any concurrent change you notice.
- `.codebuddy/memory/*.md` and `bls-memory/*.md` may have concurrent writers: **read the file (or
  `git show HEAD:<file>`) before overwriting** — never overwrite from session memory alone.

## VI. Frontend UI conventions (bls-admin)

- **Prefer antd's own components over hand-rolled code**: use the built-in selection/state of the component in play
  (`Tree checkable` + `onCheck`, `Checkbox.Group`, table `rowSelection`); don't write one-off row backgrounds or
  layout styles — copy patterns from `pages/system/dept`, `pages/ai/workbench`, `components/RebuildIndexModal`.
  Toolbar actions are **antd icon buttons** (`<Button type="text" size="small" icon={...} />`, no label).
- Keep UI refactors **minimal and literal**. Do not reorganise the data model or invent a new grouping on your own
  initiative (a rejected example: turning the permission tree's first-level menus into group headings —
  "一级的话不是目录").
- `/system/role` permission panel (settled after two rounds): three visual levels = 目录 / 页面 / 按钮; 目录+页面 are
  the antd `Tree` levels, the **button level is a horizontal `Checkbox.Group` on its own line under the page**; the
  right `Splitter.Panel` uses a **fixed `defaultSize={480}`** (`min={360}` `max={720}`), not `50%`.
- `CrudTablePage` (`components/CrudTablePage/index.tsx`) renders the 操作 column only when `showActions` is true
  (default). Read-only pages with no edit/status/extraActions/delete must pass `showActions={false}`.
- The user watches the running app → UI changes must stay smooth: avoid full-table re-renders on every click and
  per-render O(n²) work (menu trees can hold hundreds of nodes).
- Do not launch `agent-browser`/an automated browser here to self-verify UI changes; the user cancels it. State the
  change instead and let them look.
- **Aligning an overlay (SVG) with a background image**: match `viewBox` to the image's **real pixel size**, and never
  put a `scale` on only one of the two layers — **`transform-origin` differs**: HTML defaults to `50% 50%`, **SVG to
  `0 0`**. Keep both untransformed (parallax via `x`/`y` only).
- Long text cells that must be copied (`pages/system/log/sql-audit.tsx` `sqlText`): clicking the text copies it
  (`navigator.clipboard` when `window.isSecureContext`, else hidden `<textarea>` + `execCommand('copy')`) and shows
  `message.success`; keep a `CopyOutlined` icon button for affordance and move expand/collapse onto its own
  `ExpandOutlined`/`CompressOutlined` icon button.

## VII. Marketing site (`bls-site/`, added 2026-09-28)

- A **standalone product website** lives in `bls-site/` (Vite + React 19 + TS; framer-motion + GSAP ScrollTrigger +
  R3F/Drei + lucide-react). It is **deliberately git-ignored** (`.gitignore` → `bls-site/`) and fully decoupled from
  `bls-admin` / all backends. Run it with `cd bls-site && npm run dev`.
- Design language = **Liquid Glass** light theme (`#F7F9FC`/`#FAFBFD`/`#FFFFFF`, primary `#1677FF`), no AI-gradient /
  cyber / neon styling; all capability copy is derived from the real repo (README + `docs/` + `bls-memory/`).
- Reusable liquid primitives live in `bls-site/src/components/liquid/*` with design tokens in
  `bls-site/src/styles/tokens.css`; all copy is centralised in `bls-site/src/content/site.ts`.
