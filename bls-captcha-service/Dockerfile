# TIANAI CAPTCHA 微服务镜像（多阶段构建）
# 构建：docker build -t bls-captcha-service:1.0.0 ./bls-captcha-service
# 运行：由 docker-compose.captcha.yml 拉起（**不发布端口**，仅内网可达）

# ---------- 构建阶段 ----------
FROM maven:3.9-eclipse-temurin-8 AS build
WORKDIR /build
# 先拷 pom 以便利用依赖层缓存
COPY pom.xml .
RUN mvn -B -q dependency:go-offline || true
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---------- 运行阶段 ----------
FROM eclipse-temurin:8-jre
WORKDIR /app
COPY --from=build /build/target/bls-captcha-service-*.jar app.jar

# 仅容器内网使用；不对宿主/公网映射
EXPOSE 8083

# 无外网依赖，直接启动
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-jar", "/app/app.jar"]
