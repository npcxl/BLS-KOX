# ====== Stage 1: Build ======
FROM maven:3.9-eclipse-temurin-21-alpine AS builder

ARG APP_VERSION
ARG COMMIT_HASH

WORKDIR /build

COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src/ ./src/
RUN mvn package -DskipTests -B

# ====== Stage 2: Runtime ======
FROM eclipse-temurin:21-jre-alpine

ARG APP_VERSION
ARG COMMIT_HASH

LABEL org.opencontainers.image.title="BLS-KOX Java Server"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${COMMIT_HASH}"

WORKDIR /app

RUN addgroup -g 2000 bls && adduser -u 2000 -G bls -D bls

COPY --from=builder /build/target/*.jar app.jar

RUN mkdir -p uploads && chown -R bls:bls /app

USER bls

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
