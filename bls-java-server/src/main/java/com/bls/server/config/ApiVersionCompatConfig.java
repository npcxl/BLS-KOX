package com.bls.server.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;

import java.io.IOException;

/**
 * Rewrite /api/v1/* requests to /api/* for backward compatibility.
 * Adds Deprecation and Sunset headers to v1 requests.
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

    static class ApiV1RewriteFilter implements Filter {
        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest httpRequest = (HttpServletRequest) request;
            HttpServletResponse httpResponse = (HttpServletResponse) response;

            // Add deprecation headers
            httpResponse.setHeader("Deprecation", "true");
            httpResponse.setHeader("Sunset", "Sat, 01 Jan 2028 00:00:00 GMT");
            httpResponse.setHeader("Link", "</api>; rel=\"successor-version\"");

            // Rewrite /api/v1/xxx to /api/xxx
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
}
