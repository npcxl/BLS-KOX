package com.bls.server.config;

import com.bls.server.service.SessionService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory SessionService for tests (no Redis dependency).
 */
@TestConfiguration
public class TestSessionConfig {

    @Bean
    @Primary
    public SessionService testSessionService() {
        return new InMemorySessionService();
    }

    static class InMemorySessionService extends SessionService {

        private final Map<String, String> sessions = new ConcurrentHashMap<>();
        private final Map<String, Set<String>> indexes = new ConcurrentHashMap<>();

        public InMemorySessionService() {
            super(null);
        }

        @Override
        public void createSession(String tenantId, String userId, String sessionId) {
            String key = sessionKey(tenantId, userId, sessionId);
            String indexKey = indexKey(tenantId, userId);
            sessions.put(key, "{\"status\":\"active\"}");
            indexes.computeIfAbsent(indexKey, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
        }

        @Override
        public boolean validateSession(String tenantId, String userId, String sessionId) {
            String key = sessionKey(tenantId, userId, sessionId);
            return sessions.containsKey(key);
        }

        @Override
        public void touchSession(String tenantId, String userId, String sessionId) {
            // No-op in tests
        }

        @Override
        public void revokeSession(String tenantId, String userId, String sessionId) {
            String key = sessionKey(tenantId, userId, sessionId);
            String indexKey = indexKey(tenantId, userId);
            sessions.remove(key);
            Set<String> set = indexes.get(indexKey);
            if (set != null) set.remove(sessionId);
        }

        @Override
        public void revokeAllSessions(String tenantId, String userId) {
            String indexKey = indexKey(tenantId, userId);
            Set<String> set = indexes.remove(indexKey);
            if (set != null) {
                for (String sid : set) {
                    sessions.remove(sessionKey(tenantId, userId, sid));
                }
            }
        }

        @Override
        public void storeAuthSession(String accessJti, String refreshJti, String userId,
                                      String tenantId, String refreshTokenHash) {
            // No-op in tests
        }

        @Override
        public AuthSessionData getAuthSession(String accessJti) {
            return null;
        }

        private String sessionKey(String tenantId, String userId, String sessionId) {
            return "session:" + tenantId + ":" + userId + ":" + sessionId;
        }

        private String indexKey(String tenantId, String userId) {
            return "session:index:" + tenantId + ":" + userId;
        }
    }
}
