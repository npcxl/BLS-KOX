---
name: bls-kox
description: >-
  This skill should be used when working on the BLS-KOX multi-tenant SaaS platform.
  It provides comprehensive knowledge about the project's dual-backend architecture
  (Koa TypeScript + Spring Boot Java), multi-module monorepo structure, database schema,
  API conventions, security patterns, and deployment configuration.
  Use this skill when adding features, fixing bugs, refactoring, or answering
  questions about any part of the BLS-KOX codebase.
---

# BLS-KOX Project Knowledge

## Overview

BLS-KOX is an open-source multi-tenant SaaS backend framework and admin dashboard template featuring a **dual-backend architecture**. Two API-compatible backends (Koa TypeScript and Spring Boot Java 21) share one React frontend, one MySQL database, and one Redis instance. Licensed under Mulan PSL v2.

## Repository Structure

The project is a **monorepo** at `c:/git-bls/BLS-KOX/` with these sub-projects:

| Directory | Purpose | Tech Stack | Port |
|-----------|---------|------------|------|
| `bls-admin/` | Admin frontend SPA | React 19, Ant Design Pro 6, UmiJS Max, TypeScript | 9000 |
| `bls-server/` | Primary backend | Koa 3.x, TypeScript, Kysely ORM, Zod | 7001 |
| `bls-java-server/` | Alternative backend | Spring Boot 3.3.5, Java 21, MyBatis-Plus 3.5 | 8080 |
| `bls-event-service/` | Event/audit microservice | Koa 3.x, TypeScript, MySQL | 7101 |
| `sql/` | Shared database schema | MySQL 8.0 | - |
| `docs/` | Documentation | Markdown | - |
| Root | Deployment configs | Docker Compose, Nginx, env templates | - |

The project has also been split into **5 independent repositories** via git branches:
- `project/admin` → `BLS-KOX-Admin` (frontend only)
- `project/koa` → `BLS-KOX-Koa` (Koa backend only)
- `project/java` → `BLS-KOX-Java` (Java backend only)
- `project/event-service` → `BLS-KOX-Event-Service` (event microservice only)
- `project/deploy` → `BLS-KOX-Deploy` (deployment configs only)

The main branch (`master`) contains the full monorepo. When working on individual projects, always stay on `master` branch.

## Architecture

```
bls-admin (React 19) ──HTTP/WS──▶ Nginx (port 80) ──/api──▶ bls-server (Koa, 7001)
                                                            OR
                                                            bls-java-server (Java, 8080)
                                     │
                                     ├──▶ MySQL 8.0 (shared)
                                     ├──▶ Redis 7 (shared sessions/cache/rate-limit)
                                     └──▶ bls-event-service (7101, optional audit)
```

**Key design decisions:**
1. Only ONE backend is active at a time (switched via Nginx upstream)
2. Both backends share the same MySQL schema (`sql/Init.sql`) and Redis
3. Both backends expose **API-compatible** REST endpoints — frontend code never changes
4. Multi-tenant isolation via `tenant_id` row-level filtering on all tables
5. `tenant_id = 0` represents the platform super-admin

## Frontend (`bls-admin/`)

### Key Commands
```bash
cd bls-admin
npm install
npm run dev          # Start dev server on port 9000
npm run build        # Production build
npm run tsc          # Type check
npm run test         # Run tests (vitest)
```

### Directory Layout
```
bls-admin/src/
├── app.tsx                  # App entry
├── pages/                   # Page components
│   ├── dashboard/           # Admin dashboard
│   └── system/              # System management pages
│       ├── config/          # System config
│       ├── dept/            # Department management
│       ├── dict/            # Dictionary management
│       ├── file-config/     # File & storage config
│       ├── log/             # Log center
│       ├── menu/            # Menu management
│       ├── role/            # Role management
│       ├── tenant-package/  # Tenant & package management
│       ├── theme/           # Theme configuration
│       └── user/            # User management
├── components/              # Shared components
│   └── CrudTablePage/       # Core CRUD table component
├── services/                # API service layer
├── hooks/                   # Custom hooks (useWebSocket, etc.)
├── auth/                    # Authentication
└── locales/                 # i18n
```

### Key Patterns
- Pages use `CrudTablePage` component for standard CRUD operations
- API requests go through the service layer under `services/`
- WebSocket connections via `useWebSocket` hook for realtime data
- Environment variables in `.env` (copy from `.env.example`)

## Koa Backend (`bls-server/`)

### Key Commands
```bash
cd bls-server
npm install
cp .env.example .env    # Configure DB/Redis connections
npm run db:init         # Initialize database
npm run dev             # Start dev server (tsx watch)
npm run build           # Compile TypeScript
```

### Directory Layout
```
bls-server/src/
├── app.ts                   # Koa app entry point
├── api/                     # API endpoints (auto-scanned and registered)
│   ├── auth/                # Login/logout/token/profile
│   ├── system/              # 18 system modules
│   │   ├── user/            # User CRUD
│   │   ├── role/            # Role CRUD
│   │   ├── menu/            # Menu CRUD
│   │   ├── dept/            # Department CRUD
│   │   ├── tenant/          # Tenant management
│   │   ├── config/          # System configuration
│   │   ├── dict/            # Dictionary management
│   │   ├── log/             # Audit & operation logs
│   │   ├── security/        # Security dashboard
│   │   ├── storage/         # File storage config
│   │   ├── webhook/         # Webhook management
│   │   ├── page-config/     # Dynamic page column config
│   │   ├── realtime/        # WebSocket realtime data
│   │   ├── global-search/   # Ctrl+K search
│   │   ├── job/             # Scheduled jobs
│   │   ├── package/         # Tenant packages
│   │   └── theme/           # Theme configuration
│   └── common/              # Excel import/export
├── core/                    # Framework core
│   ├── crud.ts              # defineCrudModule() factory
│   ├── database.ts          # MySQL connection pool + getDb()
│   ├── router.ts            # Auto-scan route registration
│   └── ...
├── middleware/               # HTTP middleware chain
│   ├── auth.ts              # JWT authentication
│   ├── tenant.ts            # Tenant context injection
│   ├── permission.ts        # RBAC permission check
│   └── ...
├── security/                # Security modules
│   ├── data-scope/          # Data scope (ALL/TENANT/DEPT/SELF/CUSTOM)
│   ├── event-center/        # Security event center + risk rules
│   ├── file-security.ts     # File upload validation
│   ├── rate-limit/          # IP + account multi-dimension rate limiting
│   ├── session/             # Session center + refresh token rotation
│   └── ownership.ts         # Cross-tenant access guard
├── shared/                  # Shared utilities
│   ├── utils/jwt.ts         # JWT sign/verify
│   ├── utils/password.ts    # Password hashing
│   ├── utils/snowflake.ts   # Distributed ID generator
│   ├── utils/pagination.ts  # Pagination helpers
│   └── ...
├── services/                # Service layer
├── observability/           # OpenTelemetry + Prometheus metrics
├── outbox/                  # Outbox pattern for event publishing
├── queue/                   # Job worker (polls sys_jobs table)
├── distributed/             # Distributed lock, idempotency, trace
└── scripts/                 # CLI: db init, migrate, backup, openapi
```

### Key Patterns
- **CRUD Factory**: Use `defineCrudModule()` in `core/crud.ts` to generate full CRUD endpoints from a configuration object
- **Data Access**: New business code should use Kysely ORM via `await getDb()` from `core/database.ts`
- **Repository Pattern**: Controller → Service → Repository (Repository handles Kysely queries)
- **Tenant Filtering**: All queries MUST include `tenant_id` filter and `deleted = 0` for soft-delete tables
- **Validation**: Use Zod schemas for request validation
- **API Convention**: Unified response format via `ApiResponse` wrapper

## Java Backend (`bls-java-server/`)

### Key Commands
```bash
cd bls-java-server
cp src/main/resources/application.example.yml src/main/resources/application.yml
# Edit application.yml with DB/Redis credentials
mvn clean package -DskipTests
java -jar target/bls-java-server-1.0.0.jar
```

### Directory Layout
```
bls-java-server/src/main/java/com/bls/server/
├── BlsJavaServerApplication.java
├── controller/           # REST controllers (mirror Koa API)
│   ├── AuthController.java
│   ├── common/           # Excel import/export
│   └── system/           # User, Role, Menu, Dept, Dict, Config, etc.
├── service/              # Business service layer
├── mapper/               # MyBatis-Plus mapper interfaces
├── entity/               # Entity classes (@TableName)
├── security/             # JWT filter, token provider, TenantContext
├── config/               # Spring config (Security, Redis, Knife4j, WebSocket)
├── core/                 # BaseCrudController, BaseCrudService
├── distributed/          # Lock, rate-limit, idempotent, trace, metrics
├── websocket/            # WebSocket handler
└── common/               # ApiResponse, AppException, GlobalExceptionHandler
```

### API Documentation
- Knife4j (Swagger): http://localhost:8080/doc.html
- Health: http://localhost:8080/internal/health
- Metrics: http://localhost:8080/internal/metrics

## Event Service (`bls-event-service/`)

### Key Commands
```bash
cd bls-event-service
npm install
cp .env.example .env
npm run dev             # Port 7101
```

### Purpose
- Receives security audit events from the main backends
- Persists operation logs and security alerts
- Uses `INTERNAL_SECRET` for service-to-service authentication
- Independent Koa microservice with its own MySQL connection

## Database Schema

> **Full schema reference**: See `references/database-schema.md` for complete CREATE TABLE statements, column names, types, and seed data. Always consult this reference before writing SQL to avoid column name errors (e.g., `sort_num` NOT `order_num`, `create_time` NOT `created_at`).

All tables defined in `sql/Init.sql`. Key tables:
- `sys_user`, `sys_role`, `sys_menu` — RBAC core
- `sys_tenant`, `sys_tenant_package` — Multi-tenant management
- `sys_dept` — Department hierarchy
- `sys_dict_type`, `sys_dict_data` — System dictionaries
- `sys_config` — Dynamic system configuration
- `sys_operation_log`, `sys_security_log` — Audit logs
- `sys_job` — Scheduled job definitions
- `sys_file`, `sys_file_config` — File storage
- `outbox_event` — Outbox pattern events
- `sys_webhook`, `sys_webhook_delivery` — Webhook system

**Critical rules:**
- All multi-tenant tables have `tenant_id` column
- All soft-delete tables have `deleted` column (0 = active, 1 = deleted)
- `tenant_id = 0` = platform super-admin scope
- Default tenant: `000000`, superadmin/123456

## Deployment

### Docker (Recommended)
```bash
docker compose --env-file .env.docker up -d --build
```

### Local Development
```bash
# 1. Start infrastructure
docker compose --env-file .env.docker up -d mysql redis minio

# 2. Initialize DB
docker exec bls-mysql mysql -uroot -p kox < sql/Init.sql

# 3. Start backend (Koa)
cd bls-server && npm install && npm run dev

# 4. Start frontend
cd bls-admin && npm install && npm run dev
```

### Switching Backends (Koa ↔ Java)
Modify `nginx.conf` upstream block to point to the desired backend service.

## Security Features

| Feature | Implementation |
|---------|---------------|
| JWT Auth | Access + Refresh tokens with rotation and reuse detection |
| RBAC | Role → Menu → Button three-level permission |
| Multi-tenant Isolation | Automatic `tenant_id` injection, cross-tenant access alerts |
| Rate Limiting | IP + account multi-dimension Redis Lua sliding window |
| Replay Protection | Timestamp + Nonce + HMAC signature verification |
| IP Blacklist | Redis instant + DB persistent, auto-ban via event center |
| File Security | Extension/MIME/Magic Number validation, path traversal protection |
| Data Scope | ALL / TENANT / DEPT / DEPT_AND_CHILDREN / SELF / CUSTOM |
| Security Audit | 24 event types, 4 risk levels, full-chain logging |

## Working Conventions

1. **Never modify master branch structure** — the monorepo must stay intact
2. **Build outputs are gitignored**: `dist/`, `build/`, `target/`, `node_modules/`, `coverage/`
3. **Environment files**: `.env.example` and `.env.docker.example` are committed; `.env`, `.env.docker`, `.env.production` are gitignored (except in BLS-KOX-Deploy where they need to be removed)
4. **API compatibility**: When adding endpoints to one backend, ensure the other backend can support the same contract
5. **Frontend API calls**: Go through `services/` layer, never call `fetch` directly in components
6. **Koa backend**: New modules use Kysely ORM; existing modules may still use raw SQL
7. **Code style**: Frontend uses Biome for linting/formatting; Koa backend uses TypeScript compiler for type checking
