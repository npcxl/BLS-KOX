/* ============================================================================
   BLS-KOX — Site content
   Every statement below is derived from the real repository (README.md, docs/*,
   bls-memory/*). Nothing here is invented: no customer counts, no benchmarks,
   no unshipped features.
   ========================================================================== */

const REPO = 'https://github.com/npcxl/BLS-KOX';

/** Link to a tracked file / folder inside the repository. */
export const repo = (path: string) => `${REPO}/blob/master/${path}`;
export const repoTree = (path: string) => `${REPO}/tree/master/${path}`;

export const LINKS = {
  github: REPO,
  issues: `${REPO}/issues`,
  gitee: 'https://gitee.com/leheya/bls-kox',
  demo: 'https://admin.xlcig.cn',
  license: 'http://license.coscl.org.cn/MulanPSL2',
  docsIndex: repo('docs/index.md'),
  gettingStarted: repo('docs/getting-started.md'),
  dockerDeploy: repo('docs/docker-deploy.md'),
  architecture: repo('docs/architecture.md'),
  security: repo('docs/security.md'),
  backendComparison: repo('docs/backend-comparison.md'),
  backendKoa: repo('docs/backend-koa.md'),
  backendJava: repo('docs/backend-java.md'),
  backendRust: repo('bls-rust-server/README.md'),
  apiCompatibility: repo('docs/api-compatibility.md'),
  crud: repo('docs/crud.md'),
  productionChecklist: repo('docs/production-checklist.md'),
  memoryIndex: repo('bls-memory/README.md'),
  agents: repo('AGENTS.md'),
  licenseFile: repo('LICENSE'),
} as const;

/* -------------------------------------------------------------------------- */

export const NAV_ITEMS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'Memory', href: '#memory' },
] as const;

export const NAV_EXTERNAL = { label: 'Docs', href: LINKS.docsIndex } as const;

/* -------------------------------------------------------------------------- */

export const HERO = {
  eyebrow: 'Enterprise SaaS Foundation',
  title: 'BLS-KOX',
  subtitle: ['One Frontend.', 'Three Backends.', 'One SaaS Foundation.'],
  description:
    '面向企业 SaaS 的多后端开发底座。让 React、Koa、Java、Rust、数据、安全与 AI 能力运行在统一架构之上。',
  stack: ['Koa · Spring Boot · Rust', 'React 19 · MySQL · Redis'],
  primaryCta: { label: 'Get Started', href: LINKS.gettingStarted },
  secondaryCta: { label: 'GitHub', href: LINKS.github },
  quickActions: [
    { id: 'docs', label: 'Docs', href: LINKS.docsIndex },
    { id: 'github', label: 'GitHub', href: LINKS.github },
    { id: 'demo', label: 'Live Demo', href: LINKS.demo },
    { id: 'deploy', label: 'Deploy', href: LINKS.dockerDeploy },
  ],
} as const;

/** Outer nodes of the System Core. Short labels only. */
export const CORE_NODES = [
  { id: 'api', label: 'API', angle: -90 },
  { id: 'data', label: 'Data', angle: -30 },
  { id: 'security', label: 'Security', angle: 30 },
  { id: 'ai', label: 'AI', angle: 90 },
  { id: 'realtime', label: 'Realtime', angle: 150 },
  { id: 'observability', label: 'Observability', angle: 210 },
] as const;

/** The three orbits of the System Core. */
export const CORE_ORBITS = [
  { id: 'koa', label: 'Koa', sub: 'TypeScript', tilt: 0 },
  { id: 'java', label: 'Spring Boot', sub: 'Java 21', tilt: 60 },
  { id: 'rust', label: 'Rust', sub: 'Axum', tilt: 120 },
] as const;

/* -------------------------------------------------------------------------- */

export const BACKENDS = {
  eyebrow: 'Core difference',
  title: 'One system.\nThree backends.',
  lede: '同一套 React 前端、MySQL、Redis 与 API 规范，根据团队和业务需要选择不同后端。切换只需改一处代理地址，前端零改动。',
  capsuleLabel: 'BLS-KOX API Contract',
  modules: [
    {
      id: 'koa',
      name: 'Koa',
      badge: 'Default Backend',
      accent: 'primary' as const,
      stack: ['TypeScript', 'Kysely', 'Zod'],
      points: ['defineCrudConfig() 配置式 CRUD', '中间件链：JWT → 租户 → 防重放 → 限流', 'Node.js 单进程，部署轻量'],
      docs: LINKS.backendKoa,
    },
    {
      id: 'java',
      name: 'Spring Boot',
      badge: 'Enterprise Option',
      accent: 'soft' as const,
      stack: ['Java 21', 'Spring Boot 3.3', 'MyBatis-Plus'],
      points: ['Spring Security 方法级权限', '@DistributedLock · @Idempotent · @RateLimit', 'Actuator + Micrometer + Prometheus'],
      docs: LINKS.backendJava,
    },
    {
      id: 'rust',
      name: 'Rust',
      badge: 'High-performance Option',
      accent: 'soft' as const,
      stack: ['Axum 0.8', 'SQLx', 'Tokio'],
      points: ['同一套 API 与响应结构', '同一套 MySQL / Redis', '低内存占用的服务端实现'],
      docs: LINKS.backendRust,
    },
  ],
  invariants: ['Same Frontend', 'Same Database', 'Compatible API'],
  switchNote: 'the Nginx upstream (prod) or bls-admin/config/proxy.ts (dev)',
} as const;

/* -------------------------------------------------------------------------- */

export const LAYERS = [
  { id: 'client', label: 'Client' },
  { id: 'edge', label: 'Edge' },
  { id: 'service', label: 'Services' },
  { id: 'infra', label: 'Infrastructure' },
] as const;

export type ArchNodeId =
  | 'frontend'
  | 'nginx'
  | 'koa'
  | 'java'
  | 'rust'
  | 'ai'
  | 'mysql'
  | 'redis'
  | 'minio'
  | 'prometheus';

export interface ArchNode {
  id: ArchNodeId;
  layer: (typeof LAYERS)[number]['id'];
  name: string;
  caption: string;
  accent?: boolean;
  /** Node ids whose connector lights up on hover. */
  links: ArchNodeId[];
  panel: { title: string; rows: { k: string; v: string }[]; note?: string };
}

export const ARCH_NODES: ArchNode[] = [
  {
    id: 'frontend',
    layer: 'client',
    name: 'React 19',
    caption: 'Ant Design Pro 6 · UmiJS Max',
    accent: true,
    links: ['nginx'],
    panel: {
      title: 'Admin frontend',
      rows: [
        { k: 'Stack', v: 'React 19 · Ant Design Pro 6 · UmiJS Max' },
        { k: 'Build', v: 'utoopack (@utoo/pack)' },
        { k: 'Tables', v: 'CrudTablePage + usePageConfig()' },
        { k: 'Routes', v: 'config/routes.ts, 菜单由后端下发' },
      ],
      note: '三套后端共用同一份前端代码，切换后端不需要重新构建。',
    },
  },
  {
    id: 'nginx',
    layer: 'edge',
    name: 'Nginx',
    caption: 'reverse proxy · static · ws',
    links: ['frontend', 'koa', 'java', 'rust', 'ai'],
    panel: {
      title: 'Edge',
      rows: [
        { k: 'Static', v: '托管 bls-admin/dist' },
        { k: 'Proxy', v: '/api → backend, /ws → realtime' },
        { k: 'AI', v: '/api/ai/ 关闭 proxy_buffering（SSE）' },
        { k: 'Security', v: 'CSP · gzip · limit_req zone' },
      ],
      note: 'upstream 指向 bls-server:7001，改成 bls-java-server:8080 即切换后端。',
    },
  },
  {
    id: 'koa',
    layer: 'service',
    name: 'Koa 3',
    caption: 'TypeScript · default backend',
    accent: true,
    links: ['nginx', 'mysql', 'redis', 'minio', 'prometheus'],
    panel: {
      title: 'Koa Backend',
      rows: [
        { k: 'Runtime', v: 'Node.js 22 · Koa 3 · TypeScript' },
        { k: 'Data', v: 'Kysely（类型安全 SQL 构建器）' },
        { k: 'Validation', v: 'Zod schema（运行时）' },
        { k: 'CRUD', v: 'defineCrudConfig() 工厂' },
        { k: 'Pipeline', v: 'errorHandler → helmet → cors → trace → tenant → replay → ip-block → rate-limit → jwtAuth → data-scope → hasPerm' },
      ],
      note: '默认主后端，端口 6001（容器内 7001）。',
    },
  },
  {
    id: 'java',
    layer: 'service',
    name: 'Spring Boot',
    caption: 'Java 21 · API compatible',
    links: ['nginx', 'mysql', 'redis'],
    panel: {
      title: 'Java Backend',
      rows: [
        { k: 'Runtime', v: 'Java 21 · Spring Boot 3.3.5' },
        { k: 'Data', v: 'MyBatis-Plus' },
        { k: 'Permission', v: "@PreAuthorize(\"hasAuthority('PERM_…')\")" },
        { k: 'Distributed', v: '@DistributedLock · @Idempotent · @RateLimit' },
        { k: 'Metrics', v: 'Actuator + Micrometer' },
      ],
      note: '与 Koa 共用同一套表结构与 API 契约，同时只运行一套。',
    },
  },
  {
    id: 'rust',
    layer: 'service',
    name: 'Rust',
    caption: 'Axum · API compatible',
    links: ['nginx', 'mysql', 'redis'],
    panel: {
      title: 'Rust Backend',
      rows: [
        { k: 'Runtime', v: 'Rust 1.85+ · Axum 0.8 · Tokio' },
        { k: 'Data', v: 'SQLx' },
        { k: 'Contract', v: '同一路径 / 同一响应结构' },
        { k: 'Position', v: 'High-performance option' },
      ],
      note: '作为平替后端，与 Koa / Java 使用相同 API 与数据库。',
    },
  },
  {
    id: 'ai',
    layer: 'service',
    name: 'AI Service',
    caption: ':7201 · SSE streaming',
    links: ['nginx', 'koa'],
    panel: {
      title: 'bls-ai-service',
      rows: [
        { k: 'Chat', v: 'POST /api/ai/chat/completions（SSE）' },
        { k: 'Generate', v: 'CRUD 生成器 · SQL 助手' },
        { k: 'Analyse', v: '审计分析 · 配置审查' },
        { k: 'Providers', v: 'Ollama / OpenAI / DeepSeek / 通义千问' },
        { k: 'Safety', v: 'SQL 仅生成只读语句，人工审核后才执行' },
      ],
      note: '会话与消息历史由 bls-server 存储（ai_conversation）。',
    },
  },
  {
    id: 'mysql',
    layer: 'infra',
    name: 'MySQL 8',
    caption: 'shared schema',
    links: ['koa', 'java', 'rust'],
    panel: {
      title: 'Database',
      rows: [
        { k: 'Schema', v: 'sql/Init.sql（三端共用）' },
        { k: 'Migrations', v: 'bls-server/migrations/ + npm run db:migrate up' },
        { k: 'Convention', v: 'snake_case · tenant_id · deleted · create_time' },
        { k: 'FK', v: '无外键约束，完整性由应用层保证' },
      ],
      note: '迁移带 MySQL advisory lock，多实例启动不会互相竞争。',
    },
  },
  {
    id: 'redis',
    layer: 'infra',
    name: 'Redis 7',
    caption: 'session · replay · rate limit',
    links: ['koa', 'java', 'rust'],
    panel: {
      title: 'Redis',
      rows: [
        { k: 'Session', v: 'auth:session · session:{tenant}:{user}' },
        { k: 'Replay', v: 'replay:* nonce 去重 SET NX' },
        { k: 'Limit', v: 'rate:* Lua INCR + EXPIRE' },
        { k: 'Cache', v: 'config:{tenantId}（60s）' },
        { k: 'Lock', v: '分布式锁（比较并删除释放）' },
      ],
      note: 'key 前缀统一由 REDIS_KEY_PREFIX 注入（默认 bls:）。',
    },
  },
  {
    id: 'minio',
    layer: 'infra',
    name: 'MinIO',
    caption: 'object storage',
    links: ['koa'],
    panel: {
      title: 'Object storage',
      rows: [
        { k: 'Provider', v: 'MinioProvider（putObject / removeObject）' },
        { k: 'Access', v: '公开 URL 或预签名私有 URL（300s）' },
        { k: 'Key', v: 'moduleName/randomUUID + 扩展名' },
      ],
      note: 'sys_storage_config 支持 minio / aliyun_oss / tencent_cos / aws_s3。',
    },
  },
  {
    id: 'prometheus',
    layer: 'infra',
    name: 'Prometheus',
    caption: 'metrics · tracing',
    links: ['koa'],
    panel: {
      title: 'Observability',
      rows: [
        { k: 'Metrics', v: 'GET /api/metrics（前缀 bls_kox_*）' },
        { k: 'Health', v: '/api/health · /api/ready · /internal/services' },
        { k: 'Tracing', v: 'OpenTelemetry（可选，OTLP 导出）' },
        { k: 'Logs', v: 'requestId / traceId 关联的结构化日志' },
      ],
      note: '启动时打印 KOX 服务检测表格，核心依赖不可用则拒绝启动。',
    },
  },
];

export const ARCHITECTURE = {
  eyebrow: 'Architecture',
  title: 'Designed as one system.',
  lede: '前端、边缘、服务与基础设施放在同一张图上。每个节点都是可替换的模块，连接关系才是这套底座真正的产品。',
  hint: '悬停任意节点，查看它承担的能力与连接关系。',
  footnote: 'Java 与 Rust 是 Koa 的平替实现，同一时间只有一个后端在运行。',
} as const;

/* -------------------------------------------------------------------------- */

export interface FeatureItem {
  name: string;
  blurb: string;
}

export const FEATURE_CATEGORIES = [
  {
    id: 'foundation',
    label: 'Foundation',
    caption: '一套代码基座',
    items: [
      {
        name: 'Multi-Tenant',
        blurb: 'tenant_id 由服务端请求上下文注入，请求体无法覆盖；跨租户访问自动写入安全事件。',
      },
      {
        name: 'RBAC',
        blurb: '角色 → 菜单 → 按钮三级权限，权限码形如 system:user:add，前后端与 SQL 种子保持一致。',
      },
      {
        name: 'CRUD Factory',
        blurb: 'defineCrudConfig() 以 fields 为单一字段来源，派生校验、写入白名单与响应投影，一次生成六个接口。',
      },
      {
        name: 'Dynamic Columns',
        blurb: '列的可见 / 可搜 / 可编辑在运行时配置（sys_page_column_config），新增字段不改代码。',
      },
    ] as FeatureItem[],
  },
  {
    id: 'security',
    label: 'Security',
    caption: '默认开启，而不是加钱开启',
    items: [
      { name: 'JWT', blurb: 'Access 15m / Refresh 7d，Refresh 轮换 + 复用检测，Session Center 每次请求校验。' },
      { name: 'Replay Protection', blurb: 'Timestamp + Nonce + 可选 HMAC 签名 + Idempotency-Key，写请求默认全量覆盖。' },
      { name: 'Rate Limiting', blurb: 'IP / 账号 / 用户 / 租户 / 设备五个维度，Redis Lua 原子计数，按路由分桶。' },
      { name: 'Security Audit', blurb: '安全事件类型 + 4 级风险 + 风险规则引擎，自动封禁 IP、锁定账户、吊销全部会话。' },
      { name: 'IP Blocking', blurb: 'blockedIpMiddleware 在路由之前拦截，Redis 临时封禁与 sys_ip_blacklist 长期名单双重生效。' },
      { name: 'File Security', blurb: '扩展名 + MIME + Magic Number 多层校验，对象键随机化消除路径穿越，密钥脱敏返回。' },
    ] as FeatureItem[],
  },
  {
    id: 'realtime',
    label: 'Realtime',
    caption: '异步与可靠性',
    items: [
      { name: 'WebSocket', blurb: '/ws/realtime 推送系统实时信息（CPU / 内存 / uptime），15s 心跳与断线重连。' },
      { name: 'Jobs', blurb: 'sys_jobs 队列 + 进程内 worker，FOR UPDATE SKIP LOCKED 抢占，指数退避重试与死信状态。' },
      { name: 'Worker', blurb: '任务类型集中注册，单个任务 60s 默认超时，进程退出时优雅排空在途任务。' },
      { name: 'Outbox', blurb: '业务事务内写入事件，提交后由 Publisher 投递，至少一次语义 + 死信。' },
    ] as FeatureItem[],
  },
  {
    id: 'data',
    label: 'Data',
    caption: '一套数据，三套后端',
    items: [
      { name: 'MySQL', blurb: '单份 sql/Init.sql 与增量迁移，表结构在 Koa / Java / Rust 之间完全共享。' },
      { name: 'Redis', blurb: '会话、防重放 nonce、幂等状态、限流计数、配置缓存与分布式锁统一在一份 key 规范里。' },
      { name: 'MinIO', blurb: '对象存储 provider，公开 URL 与预签名私有 URL，配置按租户切换。' },
      { name: 'Data Scope', blurb: 'ALL / TENANT / DEPT / DEPT_AND_CHILDREN / SELF / CUSTOM 六种数据级权限范围。' },
    ] as FeatureItem[],
  },
  {
    id: 'dx',
    label: 'Developer Experience',
    caption: '接口、部署与可观测性',
    items: [
      { name: 'OpenAPI', blurb: '由路由与 CRUD 配置生成 openapi.json，Swagger UI 直接查看与调试。' },
      { name: 'Webhook', blurb: 'HMAC-SHA256 签名投递，逐次记录投递结果，支持手动重试。' },
      { name: 'Docker', blurb: 'docker compose up -d 起全栈，另附 Java / Rust / 仅后端 / 外部依赖等编排文件。' },
      { name: 'Metrics', blurb: 'Prometheus 指标覆盖 HTTP、DB、Redis、安全事件、队列与 Outbox。' },
      { name: 'Tracing', blurb: 'OpenTelemetry 可选开启，HTTP / DB / Redis span 通过 OTLP 导出到 Jaeger 等后端。' },
      { name: 'Health', blurb: '/api/health 存活、/api/ready 就绪、/internal/services 依赖详情，启动时打印服务检测表格。' },
    ] as FeatureItem[],
  },
] as const;

export const FEATURES = {
  eyebrow: 'Features',
  title: 'Everything that a SaaS backend needs,\nbefore you write business code.',
  lede: '不是功能清单的堆叠，而是五个可以独立落地的能力域。左侧切换分类，右侧内容以液态形变过渡。',
} as const;

/* -------------------------------------------------------------------------- */

export const SECURITY = {
  eyebrow: 'Security',
  title: 'Security is part of the foundation.',
  lede: '认证、授权、防重放、限流、审计与数据隔离不是外挂组件，而是请求进入应用之前就已经生效的六层结构。',
  layers: [
    {
      id: 'auth',
      index: '01',
      name: 'Authentication',
      summary: 'JWT Rotation · Session Center',
      detail:
        'Access Token 15m、Refresh Token 7d；刷新时轮换并发复用检测，命中复用即吊销该用户全部会话。Session Center 在每次请求校验会话，停用账号与改密立即生效。',
    },
    {
      id: 'authz',
      index: '02',
      name: 'Authorization',
      summary: 'RBAC · Package Ceiling',
      detail:
        'hasPerm() 精确匹配权限码，唯一的绕过是平台超管身份。租户可用权限 = 角色权限 ∩ 套餐权限，授权菜单也无法越出套餐上限。',
    },
    {
      id: 'replay',
      index: '03',
      name: 'Replay Protection',
      summary: 'Timestamp · Nonce · Signature · Idempotency',
      detail:
        '写请求默认启用 nonce 校验，高风险服务端接口使用 HMAC-SHA256 签名与幂等键。nonce 去重使用 Redis SET NX，签名规则在 Redis 不可用时拒绝服务。',
    },
    {
      id: 'ratelimit',
      index: '04',
      name: 'Rate Limiting',
      summary: 'IP · Account · User · Tenant · Device',
      detail:
        '每个规则一个 Redis 计数桶，Lua 原子 INCR + EXPIRE；触发时返回 429 与 Retry-After，并在响应头暴露剩余额度。',
    },
    {
      id: 'audit',
      index: '05',
      name: 'Audit',
      summary: 'Security events · Risk rules · Auto actions',
      detail:
        '登录、操作、上传、SQL 与安全事件分别落表；事件中心在 5 分钟窗口内聚合评分，达到阈值自动封禁 IP、锁定账户或吊销会话。日志写入前对密码、Token、密钥等字段脱敏。',
    },
    {
      id: 'isolation',
      index: '06',
      name: 'Data Isolation',
      summary: 'Tenant · Ownership Guard · Data Scope',
      detail:
        '多租户表的 tenant_id 只能来自服务端上下文，缺失时写操作直接失败；Ownership Guard 在操作前校验资源归属；Data Scope 把行级可见性收敛到六种范围。',
    },
  ],
  capabilities: [
    'JWT Rotation',
    'RBAC',
    'Multi-Tenant Isolation',
    'Replay Protection',
    'Rate Limiting',
    'Security Audit',
    'IP Blocking',
    'Ownership Guard',
  ],
} as const;

/* -------------------------------------------------------------------------- */

export const MEMORY = {
  eyebrow: 'AI-readable Memory',
  title: 'A codebase that explains itself.',
  lede: 'BLS-KOX keeps architecture knowledge alongside the code, so agents can understand the system before changing it.',
  zh: '每个页面的「前端操作 → 后端校验」都被写成一份结构化文档，和代码放在同一个仓库里。',
  tree: {
    root: 'BLS-KOX/',
    entries: [
      { path: 'AGENTS.md', kind: 'file' as const, note: '代理规则入口：先读记忆库，再改代码' },
      { path: 'bls-memory/', kind: 'dir' as const, note: '页面级记忆库' },
      { path: 'README.md', kind: 'file' as const, depth: 1, note: '页面索引、模板与版本元信息规范' },
      { path: 'pages/', kind: 'dir' as const, depth: 1, note: '一页一档，覆盖每个管理页面' },
      { path: '00-common/', kind: 'dir' as const, depth: 1, note: '13 篇跨领域公共文档' },
      { path: 'CHANGELOG.md', kind: 'file' as const, depth: 1, note: '文档集变更记录' },
    ],
  },
  docs: [
    {
      file: '00-architecture.md',
      title: 'Architecture',
      tags: ['Request pipeline', 'CRUD factory', 'Router scan', 'Error codes'],
    },
    {
      file: '01-redis.md',
      title: 'Redis',
      tags: ['Key namespaces', 'TTL', 'Fail-open / fail-closed'],
    },
    {
      file: '04-auth-and-permissions.md',
      title: 'Auth & permissions',
      tags: ['JWT', 'Session', 'RBAC', 'Tenant isolation', 'Data scope'],
    },
    {
      file: '05-security-log-and-event-center.md',
      title: 'Security log',
      tags: ['Event types', 'Risk levels', 'Auto actions', 'IP blocking'],
    },
    {
      file: '06-file-and-excel-security.md',
      title: 'File & Excel',
      tags: ['Upload chain', 'Storage providers', 'Import / export'],
    },
    {
      file: '07-database.md',
      title: 'Database',
      tags: ['Table inventory', 'Conventions', 'Migrations', 'Known drift'],
    },
    {
      file: '09-realtime-websocket.md',
      title: 'Realtime',
      tags: ['/ws/realtime', 'Broadcast payload', 'Nginx upgrade'],
    },
    {
      file: '10-job-api-and-queue.md',
      title: 'Jobs & queue',
      tags: ['sys_jobs', 'Worker', 'Retry', 'Dead letter'],
    },
  ],
  records: [
    '页面操作',
    'HTTP 接口',
    '后端校验',
    '权限码',
    '租户隔离',
    'Redis Key',
    '数据库表',
    '安全规则',
  ],
  footnote: '三套后端共用同一份记忆：Koa 与 Java 的差异写在文档里，而不是写在某个人的脑子里。',
} as const;

/* -------------------------------------------------------------------------- */

export const CRUD = {
  eyebrow: 'CRUD Factory',
  title: 'Define once.\nBuild the pipeline.',
  lede: '字段声明是唯一的输入。校验、写入白名单、搜索与筛选、响应投影、Zod schema 与 OpenAPI 文档都从它派生。',
  code: [
    'export const config = defineCrudConfig({',
    "  table: 'biz_product',",
    "  pkField: 'product_id',",
    "  permPrefix: 'business:product',",
    '  fields: {',
    "    product_name: { type: 'string', required: true, create: true, update: true, search: true },",
    "    price:        { type: 'number', required: true, create: true, update: true, min: 0 },",
    "    status:       { type: 'enum', values: ['0', '1'], status: true, filter: true },",
    '  },',
    '});',
  ],
  stage: ['fields', 'Validation', 'CRUD Factory'],
  outputs: ['List', 'Detail', 'Create', 'Edit', 'Remove', 'Status'],
  notes: [
    { k: 'Derived', v: 'createFields · updateFields · searchFields · filterFields · statusField' },
    { k: 'Guarded', v: '审计字段与 tenant_id 永不接受请求体写入' },
    { k: 'Documented', v: 'openapi.json 由同一份配置生成，不会与实现漂移' },
  ],
  docs: LINKS.crud,
} as const;

/* -------------------------------------------------------------------------- */

export const RELIABILITY = {
  eyebrow: 'Realtime & reliability',
  title: 'Synchronous where it matters.\nAsynchronous where it hurts.',
  lede: '请求、服务、队列、Worker、实时通道与可观测性串成一条链。数据点沿着路径缓慢移动，用来表示流转，而不是装饰。',
  flow: [
    { id: 'request', name: 'Request', sub: 'HTTP / WS' },
    { id: 'service', name: 'Service', sub: 'Koa · Java · Rust' },
    { id: 'queue', name: 'Queue / Outbox', sub: 'sys_jobs · outbox_event' },
    { id: 'worker', name: 'Worker', sub: '2s poll · retry · dead letter' },
    { id: 'realtime', name: 'Realtime', sub: '/ws/realtime' },
    { id: 'observability', name: 'Observability', sub: 'Prometheus · OTLP' },
  ],
  capabilities: [
    { name: 'WebSocket', detail: '3s 广播间隔 · 15s 心跳 · 断线自动重连' },
    { name: 'Jobs', detail: 'queued / processing / completed / dead' },
    { name: 'Worker', detail: 'FOR UPDATE SKIP LOCKED 抢占，安全多实例' },
    { name: 'Outbox', detail: '事务内写入，提交后投递，至少一次' },
    { name: 'Distributed Lock', detail: 'Redis SET NX 租约 + 比较删除释放' },
    { name: 'Backup / Restore', detail: 'dump + .sha256 校验，可 --verify 到临时库' },
    { name: 'Prometheus', detail: 'HTTP / DB / Redis / 安全 / 队列指标' },
    { name: 'OpenTelemetry', detail: '可选 OTLP 链路追踪导出' },
  ],
} as const;

/* -------------------------------------------------------------------------- */

export const DEPLOYMENT = {
  eyebrow: 'Deployment',
  title: 'From repository to running system.',
  lede: '一个命令启动完整技术栈，容器健康状态直接写在 docker compose ps 里。',
  command: [
    'git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX',
    'docker compose --env-file .env.docker up -d --build',
    'docker compose ps        # 全部 Up (healthy) 即成功',
  ],
  headline: 'One command.\nA complete stack.',
  modules: [
    { id: 'frontend', name: 'Frontend', sub: 'bls-admin' },
    { id: 'nginx', name: 'Nginx', sub: 'edge' },
    { id: 'backend', name: 'Backend', sub: 'bls-server' },
    { id: 'ai', name: 'AI Service', sub: ':7201' },
    { id: 'mysql', name: 'MySQL', sub: '8.0' },
    { id: 'redis', name: 'Redis', sub: '7' },
    { id: 'minio', name: 'MinIO', sub: 'object storage' },
  ],
  endpoints: [
    { k: 'Admin', v: 'http://localhost' },
    { k: 'API / Health', v: 'http://localhost/api · /api/health' },
    { k: 'MinIO Console', v: 'http://localhost:9001' },
  ],
  docs: [
    { label: 'Docker 部署指南', href: LINKS.dockerDeploy },
    { label: '生产检查清单', href: LINKS.productionChecklist },
  ],
} as const;

/* -------------------------------------------------------------------------- */

export const TECH_STACK = [
  { name: 'React', version: '19' },
  { name: 'Ant Design Pro', version: '6' },
  { name: 'TypeScript', version: '6' },
  { name: 'Koa', version: '3' },
  { name: 'Spring Boot', version: '3.3' },
  { name: 'Java', version: '21' },
  { name: 'Rust', version: '1.85+' },
  { name: 'Axum', version: '0.8' },
  { name: 'MySQL', version: '8.0' },
  { name: 'Redis', version: '7' },
  { name: 'MinIO', version: 'object storage' },
  { name: 'Docker Compose', version: 'deploy' },
  { name: 'Nginx', version: 'edge' },
  { name: 'Prometheus', version: 'metrics' },
  { name: 'OpenTelemetry', version: 'tracing' },
] as const;

/* -------------------------------------------------------------------------- */

export const FOOTER = {
  headline: ['Build your next SaaS', 'on a stronger foundation.'],
  brand: 'BLS-KOX',
  badges: ['Open Source', 'Multi Backend', 'Enterprise Ready'],
  primary: [
    { label: 'GitHub', href: LINKS.github },
    { label: 'Documentation', href: LINKS.docsIndex },
    { label: 'Get Started', href: LINKS.gettingStarted },
  ],
  links: [
    { label: 'License', href: LINKS.license },
    { label: 'Docs', href: LINKS.docsIndex },
    { label: 'Repository', href: LINKS.github },
  ],
  meta: 'Mulan PSL v2 · 三套后端共享同一套数据库与前端',
} as const;

export const SECTION_IDS = {
  overview: 'overview',
  architecture: 'architecture',
  features: 'features',
  security: 'security',
  memory: 'memory',
} as const;
