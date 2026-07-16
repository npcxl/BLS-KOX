package com.bls.server.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

import java.io.IOException;

/**
 * API Version compatibility filter.
 * /api/v1/*  → transparently rewritten to /api/* (no deprecation headers, this is the current version)
 * /api/*      → stays as-is, but for old endpoints we add Deprecation/Sunset headers
 *
 * Strategy: The Koa backend serves both /api/* and /api/v1/* as aliases.
 * /api/v1/* is the canonical current version, /api/* is legacy.
 * Here we make /api/v1/* work transparently, and add deprecation headers to /api/*.
 */
@Configuration
public class ApiVersionCompatConfig {

    @Bean
    public FilterRegistrationBean<Filter> apiV1RewriteFilter() {
        FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new ApiV1RewriteFilter());
        registration.addUrlPatterns("/api/v1/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registration.setName("apiV1RewriteFilter");
        return registration;
    }

    @Bean
    public FilterRegistrationBean<Filter> apiDeprecationFilter() {
        FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new ApiDeprecationFilter());
        registration.addUrlPatterns("/api/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        registration.setName("apiDeprecationFilter");
        return registration;
    }

    /**
     * Transparently rewrites /api/v1/xxx → /api/xxx (no headers added).
     */
    static class ApiV1RewriteFilter implements Filter {
        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest httpRequest = (HttpServletRequest) request;

            String originalUri = httpRequest.getRequestURI();
            String newUri = originalUri.replaceFirst("/api/v1", "/api");

            HttpServletRequestWrapper wrapper = new HttpServletRequestWrapper(httpRequest) {
                @Override
                public String getRequestURI() {
                    return newUri;
                }

                @Override
                public String getServletPath() {
                    return newUri;
                }
            };

            chain.doFilter(wrapper, response);
        }
    }

    /**
     * Adds Deprecation and Sunset headers to /api/* requests (old endpoints).
     */
    static class ApiDeprecationFilter implements Filter {
        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest httpRequest = (HttpServletRequest) request;
            HttpServletResponse httpResponse = (HttpServletResponse) response;

            String uri = httpRequest.getRequestURI();
            // Don't add deprecation headers for v1 or health endpoints
            if (!uri.startsWith("/api/v1") && !uri.contains("/health") && !uri.contains("/ready")) {
                httpResponse.setHeader("Deprecation", "true");
                httpResponse.setHeader("Sunset", "Sat, 01 Jan 2028 00:00:00 GMT");
                httpResponse.setHeader("Link", "</api/v1>; rel=\"successor-version\"");
            }

            chain.doFilter(request, response);
        }
    }
}
