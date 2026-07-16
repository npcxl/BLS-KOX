package com.bls.server.security;

/**
 * Thread-local tenant context, aligned with Koa AsyncLocalStorage pattern.
 */
public class TenantContext {

    private static final ThreadLocal<TenantContextData> CONTEXT = new ThreadLocal<>();

    public static void set(String tenantId, String userId, String requestId) {
        CONTEXT.set(new TenantContextData(tenantId, userId, requestId));
    }

    public static TenantContextData get() {
        return CONTEXT.get();
    }

    public static String getTenantId() {
        TenantContextData data = CONTEXT.get();
        return data != null ? data.tenantId() : null;
    }

    public static String getUserId() {
        TenantContextData data = CONTEXT.get();
        return data != null ? data.userId() : null;
    }

    public static String getRequestId() {
        TenantContextData data = CONTEXT.get();
        return data != null ? data.requestId() : null;
    }

    public static void clear() {
        CONTEXT.remove();
    }

    public record TenantContextData(String tenantId, String userId, String requestId) {}
}
