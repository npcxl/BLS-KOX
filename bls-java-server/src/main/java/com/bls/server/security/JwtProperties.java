package com.bls.server.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {

    private String secret;
    private long accessTokenExpiration = 900;       // 15 minutes
    private long refreshTokenExpiration = 604800;    // 7 days
    private String issuer = "bls-kox";
}
