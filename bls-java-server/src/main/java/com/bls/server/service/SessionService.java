package com.bls.server.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Session Center - aligned with Koa sessionCenter.
 * Redis key pattern: session:{tenantId}:{userId}:{sessionId}
 */
@Slf4j
@Service
@ConditionalOnBean(RedisConnectionFactory.class)
public class SessionService {

    private final RedisTemplate<String, String> redisTemplate;

    public SessionService(@Autowired(required = false) RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    private static final String SESSION_PREFIX = "session:";
    private static final String SESSION_INDEX_PREFIX = "session:index:";
    private static final Duration DEFAULT_TTL = Duration.ofDays(7);

    private String sessionKey(String tenantId, String userId, String sessionId) {
        return SESSION_PREFIX + tenantId + ":" + userId + ":" + sessionId;
    }

    private String indexKey(String tenantId, String userId) {
        return SESSION_INDEX_PREFIX + tenantId + ":" + userId;
    }

    public void createSession(String tenantId, String userId, String sessionId) {
        String key = sessionKey(tenantId, userId, sessionId);
        String indexKey = indexKey(tenantId, userId);

        SessionData data = new SessionData();
        data.setSessionId(sessionId);
        data.setUserId(userId);
        data.setTenantId(tenantId);
        data.setStatus("active");
        data.setLoginTime(System.currentTimeMillis());
        data.setLastActiveTime(System.currentTimeMillis());

        redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(data), DEFAULT_TTL);
        redisTemplate.opsForSet().add(indexKey, sessionId);
        redisTemplate.expire(indexKey, DEFAULT_TTL);
    }

    public boolean validateSession(String tenantId, String userId, String sessionId) {
        String key = sessionKey(tenantId, userId, sessionId);
        String json = redisTemplate.opsForValue().get(key);
        if (StrUtil.isBlank(json)) {
            return false;
        }
        try {
            SessionData data = JSONUtil.toBean(json, SessionData.class);
            return "active".equals(data.getStatus());
        } catch (Exception e) {
            return false;
        }
    }

    public void touchSession(String tenantId, String userId, String sessionId) {
        String key = sessionKey(tenantId, userId, sessionId);
        String json = redisTemplate.opsForValue().get(key);
        if (StrUtil.isNotBlank(json)) {
            try {
                SessionData data = JSONUtil.toBean(json, SessionData.class);
                data.setLastActiveTime(System.currentTimeMillis());
                Long ttl = redisTemplate.getExpire(key, TimeUnit.SECONDS);
                if (ttl != null && ttl > 0) {
                    redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(data), Duration.ofSeconds(ttl));
                }
            } catch (Exception e) {
                log.warn("Failed to touch session: {}", e.getMessage());
            }
        }
    }

    public void revokeSession(String tenantId, String userId, String sessionId) {
        String key = sessionKey(tenantId, userId, sessionId);
        String indexKey = indexKey(tenantId, userId);
        redisTemplate.delete(key);
        redisTemplate.opsForSet().remove(indexKey, sessionId);
    }

    public void revokeAllSessions(String tenantId, String userId) {
        String indexKey = indexKey(tenantId, userId);
        Set<String> sessionIds = redisTemplate.opsForSet().members(indexKey);
        if (sessionIds != null) {
            for (String sessionId : sessionIds) {
                String key = sessionKey(tenantId, userId, sessionId);
                redisTemplate.delete(key);
            }
        }
        redisTemplate.delete(indexKey);
    }

    /**
     * Store auth session for refresh token reuse detection.
     */
    public void storeAuthSession(String accessJti, String refreshJti, String userId, String tenantId, String refreshTokenHash) {
        String key = "auth:session:" + accessJti;
        AuthSessionData data = new AuthSessionData();
        data.setUserId(userId);
        data.setAccessJti(accessJti);
        data.setRefreshJti(refreshJti);
        data.setRefreshHash(refreshTokenHash);

        redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(data), DEFAULT_TTL);

        // Also store refresh token mapping
        String refreshKey = "auth:refresh:" + refreshJti;
        redisTemplate.opsForValue().set(refreshKey, accessJti, DEFAULT_TTL);
    }

    public AuthSessionData getAuthSession(String accessJti) {
        String key = "auth:session:" + accessJti;
        String json = redisTemplate.opsForValue().get(key);
        if (StrUtil.isBlank(json)) return null;
        try {
            return JSONUtil.toBean(json, AuthSessionData.class);
        } catch (Exception e) {
            return null;
        }
    }

    public void deleteAuthSession(String accessJti) {
        if (redisTemplate == null) return;
        String key = "auth:session:" + accessJti;
        redisTemplate.delete(key);
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
