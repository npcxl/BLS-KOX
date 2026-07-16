package com.bls.server.distributed.trace;

import org.slf4j.MDC;
import org.slf4j.spi.MDCAdapter;

/**
 * 在业务代码中手动向 MDC 注入租户/用户信息。
 * 典型调用时机：JwtAuthenticationFilter 认证成功后。
 */
public final class TraceContext {

    private TraceContext() {}

    /** 注入当前请求的租户 ID */
    public static void setTenantId(String tenantId) {
        if (tenantId != null) {
            MDC.put(TraceFilter.MDC_TENANT_ID, tenantId);
        }
    }

    /** 注入当前请求的用户 ID */
    public static void setUserId(String userId) {
        if (userId != null) {
            MDC.put(TraceFilter.MDC_USER_ID, userId);
        }
    }
}
