package com.bls.server.controller.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 兼容 Knife4j 请求 /v3/api-docs/swagger-config 的场景，
 * 避免因 Springdoc 版本兼容问题返回 500。
 */
@RestController
public class SwaggerConfigController {

    @GetMapping("/v3/api-docs/swagger-config")
    public Map<String, Object> swaggerConfig() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("configUrl", "/v3/api-docs/swagger-config");
        config.put("url", "/v3/api-docs");
        config.put("validatorUrl", "");
        return config;
    }
}
