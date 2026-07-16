package com.bls.server.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class Knife4jConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("BLS-KOX Java Server API")
                        .version("1.0.0")
                        .description("BLS-KOX 多租户后台管理系统 Java 后端接口文档")
                        .contact(new Contact()
                                .name("BLS-KOX Team"))
                        .license(new License()
                                .name("Mulan PSL v2")
                                .url("http://license.coscl.org.cn/MulanPSL2")));
    }
}
