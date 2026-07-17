package com.bls.server.controller;

import cn.hutool.core.util.StrUtil;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.distributed.ratelimit.RateLimit;
import com.bls.server.security.JwtAuthenticationToken;
import com.bls.server.security.JwtTokenProvider;
import com.bls.server.security.LoginUser;
import com.bls.server.security.TenantContext;
import com.bls.server.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "认证管理", description = "登录、登出、刷新令牌、获取用户信息")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtTokenProvider jwtTokenProvider;

    @Data
    public static class LoginRequest {
        @NotBlank(message = "用户名不能为空")
        private String username;

        @NotBlank(message = "密码不能为空")
        private String password;

        private String tenantId;
    }

    @Data
    public static class RefreshRequest {
        @NotBlank(message = "刷新令牌不能为空")
        private String refreshToken;
    }

    @Operation(summary = "用户登录")
    @PostMapping("/login")
    @RateLimit(key = "login:ip:#{T(com.bls.server.controller.AuthController).resolveRateLimitIp(#httpRequest)}", limit = 20, windowSeconds = 60)
    public ApiResponse<Map<String, Object>> login(@Valid @RequestBody LoginRequest request,
                                                   HttpServletRequest httpRequest) {
        String ip = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");

        // 统一域名解析：X-Forwarded-Host > Host > Origin
        String domain = resolveTenantDomain(httpRequest);
        Map<String, Object> result = authService.loginByDomain(domain,
                request.getUsername(), request.getPassword(), ip, userAgent);

        return ApiResponse.success(result);
    }

    @Operation(summary = "退出登录")
    @PostMapping("/logout")
    @RateLimit(key = "logout:user:#{#authentication.name}", limit = 20, windowSeconds = 60)
    public ApiResponse<Void> logout(Authentication authentication,
                                     HttpServletRequest request) {
        if (authentication instanceof JwtAuthenticationToken jwtAuth) {
            LoginUser user = jwtAuth.getLoginUser();
            String token = JwtTokenProvider.extractBearerToken(request.getHeader("Authorization"));
            String accessToken = token != null ? token : "";
            authService.logout(user.getUserId(), user.getTenantId(), accessToken);
        }
        return ApiResponse.success(null, "退出成功");
    }

    @Operation(summary = "刷新令牌")
    @PostMapping("/refresh")
    @RateLimit(key = "refresh:ip:#{T(com.bls.server.controller.AuthController).resolveRateLimitIp(#httpRequest)}", limit = 30, windowSeconds = 60)
    public ApiResponse<Map<String, Object>> refresh(@Valid @RequestBody RefreshRequest request,
                                                     HttpServletRequest httpRequest) {
        String ip = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        Map<String, Object> result = authService.refreshToken(request.getRefreshToken(), ip, userAgent);
        return ApiResponse.success(result);
    }

    @Operation(summary = "获取当前用户信息")
    @GetMapping("/profile")
    public ApiResponse<Map<String, Object>> profile(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken jwtAuth)) {
            throw AppException.unauthorized("未登录");
        }
        LoginUser user = jwtAuth.getLoginUser();
        Map<String, Object> result = authService.getProfile(user.getUserId(), user.getTenantId());
        return ApiResponse.success(result);
    }

    /** SpEL 可调用的静态方法：提取客户端 IP，fallback X-Forwarded-For → X-Real-IP → remoteAddr */
    public static String resolveRateLimitIp(HttpServletRequest request) {
        if (request == null) return "unknown";
        String ip = request.getHeader("X-Forwarded-For");
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip != null ? ip : "unknown";
    }

    private String getClientIp(HttpServletRequest request) {
        return resolveRateLimitIp(request);
    }

    /**
     * 统一域名解析：X-Forwarded-Host > Host > Origin
     * 与 Koa resolveTenantDomain 保持一致。
     * X-Forwarded-Host 仅在 trustProxy 时使用。
     */
    private String resolveTenantDomain(HttpServletRequest request) {
        boolean trustProxy = "true".equalsIgnoreCase(
                request.getServletContext().getInitParameter("trustProxy"));

        // 1. X-Forwarded-Host（仅在信任代理时使用）
        if (trustProxy) {
            String forwardedHost = request.getHeader("X-Forwarded-Host");
            if (StrUtil.isNotBlank(forwardedHost)) {
                String domain = forwardedHost.split(",")[0].trim().replaceFirst(":\\d+$", "");
                if (!isLocalhost(domain)) return domain;
            }
        }

        // 2. Host header（先 strip port，再判断 localhost）
        String host = request.getHeader("Host");
        if (StrUtil.isNotBlank(host)) {
            String domain = host.replaceFirst(":\\d+$", "");
            if (!isLocalhost(domain)) return domain;
        }

        // 3. Origin header（localhost 场景的最终 fallback）
        String origin = request.getHeader("Origin");
        if (StrUtil.isNotBlank(origin)) {
            String domain = origin.replaceFirst("https?://", "")
                    .replaceFirst(":\\d+$", "")
                    .replaceFirst("/.*$", "");
            if (!isLocalhost(domain)) return domain;
        }

        // 4. 本地开发回退
        return "localhost";
    }

    private boolean isLocalhost(String host) {
        return "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host);
    }
}
