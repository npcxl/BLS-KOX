package com.bls.server.security;

import cn.hutool.core.util.StrUtil;
import com.bls.server.common.AppException;
import com.bls.server.distributed.trace.TraceContext;
import com.bls.server.service.SessionService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jws;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final SessionService sessionService;
    private final LoginUserService loginUserService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        String bearerToken = request.getHeader("Authorization");
        String token = JwtTokenProvider.extractBearerToken(bearerToken);

        if (StrUtil.isBlank(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Jws<Claims> jws = jwtTokenProvider.parseToken(token);
            Claims claims = jws.getPayload();

            String tokenType = claims.get("tokenType", String.class);
            if (!"access".equals(tokenType)) {
                filterChain.doFilter(request, response);
                return;
            }

            String userId = claims.getSubject();
            String tenantId = claims.get("tenantId", String.class);
            String jti = claims.getId();

            // Validate session (Session Center)
            if (!sessionService.validateSession(tenantId, userId, "acc:" + jti)) {
                log.warn("Session invalid for user={}, jti={}", userId, jti);
                // Write security audit
                filterChain.doFilter(request, response);
                return;
            }

            // Load user profile with permissions & roles
            LoginUser loginUser = loginUserService.loadUser(userId, tenantId);
            if (loginUser == null) {
                filterChain.doFilter(request, response);
                return;
            }

            // Set context + trace info
            TenantContext.set(tenantId, userId, null);
            TraceContext.setTenantId(tenantId);
            TraceContext.setUserId(userId);
            JwtAuthenticationToken auth = new JwtAuthenticationToken(loginUser, token);
            SecurityContextHolder.getContext().setAuthentication(auth);

            // Touch session lastActiveTime
            sessionService.touchSession(tenantId, userId, "acc:" + jti);

        } catch (ExpiredJwtException e) {
            log.debug("JWT expired: {}", e.getMessage());
            // Let it pass, auth endpoints handle this
        } catch (Exception e) {
            log.debug("JWT validation failed: {}", e.getMessage());
            // Let it pass, auth endpoints handle this
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
