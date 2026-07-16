package com.bls.server.distributed.trace;

import cn.hutool.core.util.IdUtil;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;

/**
 * 请求链路追踪过滤器 —— 注入 requestId / traceId 到 MDC 和 Response Header。
 * <p>
 * requestId 优先级：X-Request-Id 请求头 > 自动生成 UUID32
 * traceId  优先级：X-Trace-Id 请求头 > 自动生成 UUID32（与 OpenTelemetry 兼容）
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TraceFilter implements Filter {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    public static final String TRACE_ID_HEADER = "X-Trace-Id";

    public static final String MDC_REQUEST_ID = "requestId";
    public static final String MDC_TRACE_ID = "traceId";
    public static final String MDC_TENANT_ID = "tenantId";
    public static final String MDC_USER_ID = "userId";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        // 1. 提取或生成 requestId
        String requestId = httpRequest.getHeader(REQUEST_ID_HEADER);
        if (!StringUtils.hasText(requestId)) {
            requestId = IdUtil.fastSimpleUUID();
        }

        // 2. 提取或生成 traceId
        String traceId = httpRequest.getHeader(TRACE_ID_HEADER);
        if (!StringUtils.hasText(traceId)) {
            traceId = IdUtil.fastSimpleUUID();
        }

        // 3. 写入 MDC
        MDC.put(MDC_REQUEST_ID, requestId);
        MDC.put(MDC_TRACE_ID, traceId);

        // 4. 写入 Response Header
        httpResponse.setHeader(REQUEST_ID_HEADER, requestId);
        httpResponse.setHeader(TRACE_ID_HEADER, traceId);

        try {
            chain.doFilter(request, response);
        } finally {
            // 5. 清理 MDC（防止线程池复用污染）
            MDC.remove(MDC_REQUEST_ID);
            MDC.remove(MDC_TRACE_ID);
            MDC.remove(MDC_TENANT_ID);
            MDC.remove(MDC_USER_ID);
        }
    }
}
