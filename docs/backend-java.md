# Java 后端架构

## 概述

`bls-java-server` 是 BLS-KOX 的**并存 Java 后端**，基于 Spring Boot 3.3 + Java 21 构建。它与 Koa 后端共享同一套 MySQL 数据库、同一套 Redis、同一套前端代码，API 路径、返回结构、字段命名完全兼容。

> **重要**：Java 后端不是替代 Koa 后端，而是**并存后端**。两套后端可以按需选择部署，也可以通过 Nginx upstream 随时切换。前端代码无需任何修改。

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 运行时 | Java | 21 |
| 框架 | Spring Boot | 3.3.5 |
| Web | spring-boot-starter-web | - |
| 安全 | Spring Security + JWT（jjwt） | 0.12.6 |
| ORM | MyBatis-Plus | 3.5.9 |
| 数据库 | MySQL 8.0（mysql-connector-j） | - |
| 缓存/Session | spring-boot-starter-data-redis（Lettuce） | - |
| 密码加密 | Argon2（argon2-jvm） | 2.11 |
| WebSocket | spring-boot-starter-websocket | - |
| API 文档 | Knife4j（OpenAPI 3 / Swagger） | 4.5.0 |
| 工具库 | Hutool | 5.8.32 |
| Excel | EasyExcel（Alibaba） | 3.3.4 |
| 对象存储 | MinIO | 8.5.12 |
| 监控 | Micrometer + Prometheus（Actuator） | - |
| 简化代码 | Lombok | - |
| 构建 | Maven | ≥ 3.8 |

## 目录结构

```
bls-java-server/src/main/java/com/bls/server/
├── BlsJavaServerApplication.java       # Spring Boot 启动类
├── core/                                # 通用基类
│   ├── BaseCrudController.java          # 通用 CRUD 控制器基类
│   └── BaseCrudService.java             # 通用 CRUD 服务基类
├── common/                              # 公共层
│   ├── ApiResponse.java                # 统一响应体 {code, message, data, total}
│   ├── AppException.java               # 业务异常体系
│   └── GlobalExceptionHandler.java     # 全局异常处理 @RestControllerAdvice
├── config/                              # 配置层
│   ├── SecurityConfig.java             # Spring Security 核心配置（SecurityFilterChain）
│   ├── RedisConfig.java                # Redis 序列化配置（Jackson2JsonRedisSerializer）
│   ├── MyBatisPlusConfig.java          # MyBatis-Plus 分页插件配置
│   ├── MetaObjectHandlerConfig.java    # 自动填充 createTime/updateTime
│   ├── WebMvcConfig.java               # MVC 配置
│   ├── WebSocketConfig.java            # WebSocket 注册
│   ├── Knife4jConfig.java              # OpenAPI 文档配置
│   └── ApiVersionCompatConfig.java     # API 版本兼容过滤器
├── controller/                          # 控制器层
│   ├── AuthController.java             # 认证：登录/登出/刷新/profile
│   ├── HealthController.java           # 健康检查/就绪/指标
│   └── system/                         # 系统管理控制器
│       ├── UserController.java         # 用户 CRUD + 踢下线 + 改密码
│       ├── RoleController.java         # 角色 CRUD + 分配菜单
│       ├── MenuController.java         # 菜单管理
│       ├── DeptController.java         # 部门管理
│       ├── DictController.java         # 字典管理
│       ├── ConfigController.java       # 系统参数配置
│       ├── ThemeController.java        # 主题配置
│       ├── PageConfigController.java   # 页面列配置
│       ├── LogController.java          # 日志管理
│       ├── TenantController.java       # 租户管理
│       ├── TenantPackageController.java# 租户套餐管理
│       ├── FileConfigController.java   # 文件存储配置
│       ├── GlobalSearchController.java # 全局搜索
│       └── WebhookController.java      # Webhook 管理
├── entity/                              # MyBatis-Plus 实体类
│   ├── SysUser.java                    # 用户实体
│   ├── SysRole.java                    # 角色实体
│   ├── SysMenu.java                    # 菜单实体
│   ├── SysDept.java                    # 部门实体
│   ├── SysDictData.java               # 字典数据实体
│   ├── SysConfig.java                 # 系统配置实体
│   ├── SysTenant.java                 # 租户实体
│   ├── SysThemeConfig.java            # 主题配置实体
│   └── ...                            # 其他实体
├── mapper/                              # MyBatis-Plus Mapper 接口
│   ├── SysUserMapper.java              # extends BaseMapper<SysUser>
│   ├── SysRoleMapper.java              # extends BaseMapper<SysRole>
│   ├── SysMenuMapper.java              # extends BaseMapper<SysMenu>
│   └── ...                            # 其他 Mapper
├── security/                            # 安全层
│   ├── JwtTokenProvider.java           # JWT 创建/解析/验证
│   ├── JwtAuthenticationFilter.java    # JWT 认证过滤器（OncePerRequestFilter）
│   ├── JwtAuthenticationToken.java     # 自定义认证令牌
│   ├── JwtProperties.java              # JWT 配置属性（@ConfigurationProperties）
│   ├── LoginUser.java                  # 当前登录用户模型
│   ├── LoginUserService.java           # 用户权限加载服务
│   └── TenantContext.java              # ThreadLocal 租户上下文
├── service/                             # 业务服务层
│   ├── AuthService.java                # 认证业务：登录/登出/刷新/验证
│   └── system/                         # 各模块 Service
│       ├── UserService.java            # 用户业务
│       ├── RoleService.java            # 角色业务
│       ├── MenuService.java            # 菜单业务
│       ├── DeptService.java            # 部门业务
│       └── ...                        # 其他 Service
└── websocket/                           # WebSocket 层
    └── RealtimeWebSocketHandler.java   # 实时推送处理器
```

## 核心配置

### application.yml

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/kox
    driver-class-name: com.mysql.cj.jdbc.Driver
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
  data:
    redis:
      host: localhost
      port: 6379
      lettuce:
        pool:
          max-active: 20
          max-idle: 10
          min-idle: 5

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true    # snake_case ↔ camelCase 自动转换
  global-config:
    db-config:
      id-type: auto

jwt:
  secret: <your-jwt-secret>
  access-token-expiration: 900            # 15 分钟
  refresh-token-expiration: 604800        # 7 天
  issuer: bls-kox

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics
      base-path: /internal
```

## Spring Security 配置

`SecurityConfig.java` 核心配置：

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity  // 启用 @PreAuthorize
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/system/config/public-*").permitAll()
                .requestMatchers("/api/docs/**", "/api/openapi.json").permitAll()
                .requestMatchers("/internal/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

**关键设计**：
- 无状态 Session（`STATELESS`）
- JWT 过滤器在 `UsernamePasswordAuthenticationFilter` 之前执行
- 使用 `@PreAuthorize("hasAuthority('PERM_system:user:list')")` 进行方法级权限控制
- 权限标识格式：`PERM_{module}:{action}`，与 Koa 后端的 `{module}:{action}` 通过前缀 `PERM_` 区分

## JWT 认证流程

### JwtTokenProvider

```java
// 创建 Access Token
public String createAccessToken(String userId, String tenantId, String username) {
    return Jwts.builder()
        .subject(userId)
        .claim("tenantId", tenantId)
        .claim("username", username)
        .issuer("bls-kox")
        .issuedAt(new Date())
        .expiration(new Date(System.currentTimeMillis() + accessTokenExpiration * 1000))
        .signWith(secretKey)
        .compact();
}

// 解析 Token
public Claims parseToken(String token) { ... }

// 验证 Token
public boolean validateToken(String token) { ... }
```

### JwtAuthenticationFilter

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) {
        String token = resolveToken(request);           // 从 Authorization 头提取
        if (token != null && jwtProvider.validateToken(token)) {
            Claims claims = jwtProvider.parseToken(token);
            // 加载用户权限
            LoginUser loginUser = loginUserService.loadUserByUserId(claims.getSubject());
            // 设置租户上下文
            TenantContext.setTenantId(claims.get("tenantId", String.class));
            // 设置 SecurityContext
            JwtAuthenticationToken authToken = new JwtAuthenticationToken(loginUser);
            SecurityContextHolder.getContext().setAuthentication(authToken);
        }
        chain.doFilter(request, response);
        TenantContext.clear();  // 清理 ThreadLocal
    }
}
```

## 租户上下文（TenantContext）

使用 `ThreadLocal` 在当前请求线程中传递租户 ID：

```java
public class TenantContext {
    private static final ThreadLocal<String> TENANT_HOLDER = new ThreadLocal<>();

    public static void setTenantId(String tenantId) {
        TENANT_HOLDER.set(tenantId);
    }

    public static String getTenantId() {
        return TENANT_HOLDER.get();
    }

    public static void clear() {
        TENANT_HOLDER.remove();
    }
}
```

在 Service 层中通过 `TenantContext.getTenantId()` 获取当前租户 ID，写入查询条件实现多租户隔离。

## Controller → Service → Mapper 分层模式

Java 后端提供两套 CRUD 模式：

### 模式一：继承通用基类（推荐）

新模块继承 `BaseCrudController` + `BaseCrudService`，声明配置即可获得完整 CRUD：

```
BaseCrudController<T, C, E>    ← 自动提供 /list /add /edit /remove
    ↓
BaseCrudService<T, M, C, E>    ← 自动处理分页、搜索、新增、编辑、删除
    ↓
Mapper (BaseMapper<T>)          ← MyBatis-Plus 数据访问
    ↓
MySQL
```

### 模式二：手动编写（灵活模块）

认证、菜单、部门等有复杂树形逻辑的模块使用传统模式：

```
Controller（接收请求、参数校验、调用 Service）
    ↓
Service（业务逻辑、租户隔离、权限校验、事务管理）
    ↓
Mapper（MyBatis-Plus BaseMapper，数据访问）
    ↓
MySQL
```

### 示例：用户列表接口

**Controller**（`UserController.java`）：
```java
@GetMapping("/list")
@PreAuthorize("hasAuthority('PERM_system:user:list')")
public ApiResponse<List<Map<String, Object>>> list(UserQueryRequest request) {
    return userService.listUsers(request);
}
```

**Service**（`UserService.java`）：
```java
public ApiResponse<List<Map<String, Object>>> listUsers(UserQueryRequest request) {
    String tenantId = TenantContext.getTenantId();
    Page<SysUser> page = new Page<>(request.getPageNum(), request.getPageSize());

    LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(SysUser::getTenantId, tenantId);         // 租户隔离
    wrapper.eq(SysUser::getDeleted, 0);                  // 软删除过滤
    if (request.getKeyword() != null) {
        wrapper.and(w -> w
            .like(SysUser::getUsername, request.getKeyword())
            .or().like(SysUser::getNickname, request.getKeyword()));
    }

    IPage<SysUser> result = userMapper.selectPage(page, wrapper);
    return ApiResponse.pageSuccess(convertToMapList(result.getRecords()), result.getTotal());
}
```

## API 返回结构

### ApiResponse 统一响应体

```java
@Data
@Builder
public class ApiResponse<T> {
    private int code;       // 200 成功，其他为错误码
    private String message; // 提示信息
    private T data;         // 响应数据
    private Long total;     // 分页总条数（仅列表接口）

    public static <T> ApiResponse<T> success(T data) { ... }
    public static <T> ApiResponse<T> success(T data, String message) { ... }
    public static <T> ApiResponse<T> pageSuccess(T data, long total) { ... }
    public static <T> ApiResponse<T> error(int code, String message) { ... }
}
```

与 Koa 后端 `{ code, message, data, total }` 结构完全一致。

## MyBatis-Plus 配置

- **驼峰映射**：`map-underscore-to-camel-case: true` — 数据库 `snake_case` 列名自动映射到 Java `camelCase` 属性
- **分页插件**：`MybatisPlusInterceptor` + `PaginationInnerInterceptor`
- **自动填充**：`MetaObjectHandler` 自动填充 `createTime` / `updateTime`
- **逻辑删除**：通过 `@TableLogic` 注解标记 `deleted` 字段

## WebSocket 实时推送

Java 后端使用 Spring WebSocket 实现实时数据推送：

```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(realtimeHandler(), "/ws/realtime")
                .setAllowedOrigins("*");
    }
}
```

WebSocket 连接需要先发送 JWT 认证消息（`{ type: "auth", token: "..." }`），认证通过后开始推送系统实时数据。

## Knife4j API 文档

启动 Java 后端后访问：

- **Swagger UI**：http://localhost:8080/doc.html
- **OpenAPI JSON**：http://localhost:8080/api/openapi.json

Knife4j 自动扫描所有 `@RestController` 和 `@Operation` 注解生成交互式 API 文档。

## Actuator 监控端点

| 端点 | 路径 | 说明 |
|------|------|------|
| Health | `/internal/health` | 健康检查 |
| Info | `/internal/info` | 应用信息 |
| Prometheus | `/internal/prometheus` | Prometheus 指标拉取 |
| Metrics | `/internal/metrics` | 指标详情 |

## 与 Koa 后端的关系

| 维度 | Koa 后端 | Java 后端 |
|------|----------|-----------|
| 定位 | 默认主后端 | 并存后端（API 兼容） |
| 数据库 | 同一 MySQL（`sql/Init.sql`） | 同一 MySQL（`sql/Init.sql`） |
| Redis | 同一 Redis | 同一 Redis |
| 前端 | 同一 `bls-admin` | 同一 `bls-admin` |
| API 路径 | `/api/v1/system/user/list` | `/api/system/user/list` |
| 返回结构 | `{ code, message, data, total }` | `{ code, message, data, total }` |
| 权限标识 | `system:user:list` | `PERM_system:user:list` |
| 密码加密 | Argon2id | Argon2 |
| CRUD 模式 | `defineCrudModule()` 配置式 | BaseCrudController + BaseCrudService |

> **注意**：Java 后端已实现 `BaseCrudController<T, C, E>` + `BaseCrudService<T, M, C, E>` 通用 CRUD 基类（位于 `core/` 包），新模块只需继承基类并声明搜索字段、字段映射、新增/编辑赋值逻辑即可获得完整的 list/add/edit/remove 端点，代码量从 ~150 行降至 ~30 行。详见 [CRUD 工厂文档](./crud.md#java-后端-crud-演进方案)。

## 启动方式

```bash
# 1. 启动基础设施（MySQL + Redis）
docker compose up -d mysql redis

# 2. 构建并启动 Java 后端
cd bls-java-server
mvn clean package -DskipTests
java -jar target/bls-java-server-1.0.0.jar    # http://localhost:8080

# 3. 启动前端（新终端）
cd ../bls-admin
npm start                                      # http://localhost:9000
```

## 切换后端

修改 Nginx `upstream` 指向 Java 后端端口（8080）即可：

```nginx
upstream bls_server {
    server bls-java-server:8080;
}
```

详见 [API 兼容性规范](./api-compatibility.md)。
