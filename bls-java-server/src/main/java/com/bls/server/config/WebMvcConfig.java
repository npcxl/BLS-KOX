package com.bls.server.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * API version compatibility: /api/v1/* redirects to /api/*
 * aligned with Koa API versioning middleware.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void configurePathMatch(PathMatchConfigurer configurer) {
        // Map /api/v1 to /api for backward compatibility
        configurer.addPathPrefix("/api/v1", c -> false);
    }
}
