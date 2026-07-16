package com.bls.server.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class SessionService {

    private final RedisTemplate<String, String> redisTemplate;

    public SessionService(@Autowired(required = false) RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    private static final Duration DEFAULT_TTL = Duration.ofDays(7);

    private boolean isRedisAvailable() {
        return redisTemplate != null;
    }

    /** Safe wrapper — never throw on Redis failure */
    private <T> T safeOp(String op, java.util.function.Supplier<T> fn, T fallback) {
        if (!isRedisAvailable()) return fallback;
        try {
            return fn.get();
        } catch (Exception e) {
            log.debug("Redis {} failed: {}", op, e.getMessage());
            return fallback;
        }
    }

    private void safeVoid(String op, Runnable fn) {
        if (!isRedisAvailable()) return;
        try {
            fn.run();
        } catch (Exception e) {
            log.debug("Redis {} failed: {}", op, e.getMessage());
        }
    }

    private String sessionKey(String tenantId, String userId, String sessionId) {
        return "session:" + tenantId + ":" + userId + ":" + sessionId;
    }

    private String indexKey(String tenantId, String userId) {
        return "session:index:" + tenantId + ":" + userId;
    }

    public void createSession(String tenantId, String userId, String sessionId) {
        safeVoid("createSession", () -> {
            String key = sessionKey(tenantId, userId, sessionId);
            String idxKey = indexKey(tenantId, userId);
            SessionData data = new SessionData();
            data.setSessionId(sessionId);
            data.setUserId(userId);
            data.setTenantId(tenantId);
            data.setStatus("active");
            data.setLoginTime(System.currentTimeMillis());
            data.setLastActiveTime(System.currentTimeMillis());
            redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(data), DEFAULT_TTL);
            redisTemplate.opsForSet().add(idxKey, sessionId);
            redisTemplate.expire(idxKey, DEFAULT_TTL);
        });
    }

    public boolean validateSession(String tenantId, String userId, String sessionId) {
        return safeOp("validateSession", () -> {
            String key = sessionKey(tenantId, userId, sessionId);
            String json = redisTemplate.opsForValue().get(key);
            if (StrUtil.isBlank(json)) return false;
            SessionData data = JSONUtil.toBean(json, SessionData.class);
            return "active".equals(data.getStatus());
        }, true); // fallback: allow when Redis is down
    }

    public void touchSession(String tenantId, String userId, String sessionId) {
        safeVoid("touchSession", () -> {
            String key = sessionKey(tenantId, userId, sessionId);
            String json = redisTemplate.opsForValue().get(key);
            if (StrUtil.isNotBlank(json)) {
                SessionData data = JSONUtil.toBean(json, SessionData.class);
                data.setLastActiveTime(System.currentTimeMillis());
                Long ttl = redisTemplate.getExpire(key, TimeUnit.SECONDS);
                if (ttl != null && ttl > 0) {
                    redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(data), Duration.ofSeconds(ttl));
                }
            }
        });
    }

    public void revokeSession(String tenantId, String userId, String sessionId) {
        safeVoid("revokeSession", () -> {
            String key = sessionKey(tenantId, userId, sessionId);
            String idxKey = indexKey(tenantId, userId);
            redisTemplate.delete(key);
            redisTemplate.opsForSet().remove(idxKey, sessionId);
        });
    }

    public void revokeAllSessions(String tenantId, String userId) {
        safeVoid("revokeAllSessions", () -> {
            String idxKey = indexKey(tenantId, userId);
            Set<String> sessionIds = redisTemplate.opsForSet().members(idxKey);
            if (sessionIds != null) {
                for (String sessionId : sessionIds) {
                    redisTemplate.delete(sessionKey(tenantId, userId, sessionId));
                }
            }
            redisTemplate.delete(idxKey);
        });
    }

    public void storeAuthSession(String accessJti, String refreshJti, String userId,
                                  String tenantId, String refreshTokenHash) {
        safeVoid("storeAuthSession", () -> {
            String key = "auth:session:" + accessJti;
            AuthSessionData data = new AuthSessionData();
            data.setUserId(userId);
            data.setAccessJti(accessJti);
            data.setRefreshJti(refreshJti);
            data.setRefreshHash(refreshTokenHash);
            redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(data), DEFAULT_TTL);
            redisTemplate.opsForValue().set("auth:refresh:" + refreshJti, accessJti, DEFAULT_TTL);
        });
    }

    public AuthSessionData getAuthSession(String accessJti) {
        return safeOp("getAuthSession", () -> {
            String key = "auth:session:" + accessJti;
            String json = redisTemplate.opsForValue().get(key);
            if (StrUtil.isBlank(json)) return null;
            return JSONUtil.toBean(json, AuthSessionData.class);
        }, null);
    }

    public void deleteAuthSession(String accessJti) {
        safeVoid("deleteAuthSession", () ->
            redisTemplate.delete("auth:session:" + accessJti));
    }

    @lombok.Data
    public static class SessionData {
        private String sessionId;
        private String userId;
        private String tenantId;
        private String status;
        private Long loginTime;
        private Long lastActiveTime;
    }

    @lombok.Data
    public static class AuthSessionData {
        private String userId;
        private String accessJti;
        private String refreshJti;
        private String refreshHash;
    }
}
