FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Add non-root user
RUN addgroup -g 1000 bls && adduser -u 1000 -G bls -D bls

# Copy jar
COPY target/*.jar app.jar

# Create upload directory
RUN mkdir -p uploads && chown -R bls:bls uploads

USER bls

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
