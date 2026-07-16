# BLS-KOX Java Server

Spring Boot 3.3 后端，多租户 SaaS 管理框架。

## 快速启动

```bash
# 1. 复制配置文件
cp src/main/resources/application.example.yml src/main/resources/application.yml

# 2. 修改 application.yml 中的数据库和 Redis 连接信息
#    - spring.datasource.url / username / password
#    - spring.data.redis.host / port / password

# 3. 确保 MySQL 已初始化（执行项目根目录 sql/Init.sql）

# 4. 启动
mvn clean package -DskipTests
java -jar target/bls-java-server-1.0.0.jar
```

启动后访问：
- **API**：http://localhost:8080
- **文档**：http://localhost:8080/doc.html
- **健康检查**：http://localhost:8080/internal/health
- **指标**：http://localhost:8080/internal/metrics

## 目录结构

```
src/main/java/com/bls/server/
├── common/           # ApiResponse、AppException、GlobalExceptionHandler
├── config/           # SecurityConfig、RedisConfig、Knife4jConfig
├── controller/       # 控制器层
│   ├── AuthController.java
│   ├── common/       # Excel 导入导出
│   └── system/       # 用户、角色、菜单、部门、字典等
├── core/             # BaseCrudController、BaseCrudService
├── distributed/      # 分布式能力（锁、幂等、限流、链路追踪）
│   ├── lock/
│   ├── idempotent/
│   ├── ratelimit/
│   ├── trace/
│   └── metrics/
├── entity/           # MyBatis-Plus 实体
├── mapper/           # MyBatis-Plus Mapper
├── security/         # JWT、Spring Security、TenantContext
├── service/          # 业务服务层
└── websocket/        # WebSocket 实时推送
```

## 技术栈

- Spring Boot 3.3.5 + Java 21
- MyBatis-Plus 3.5.9
- Spring Security + JWT
- Redis (Lettuce)
- Knife4j 4.5 (API 文档)
- Argon2 密码加密
- Micrometer + Prometheus
