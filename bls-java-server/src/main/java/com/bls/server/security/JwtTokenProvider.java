package com.bls.server.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    private final JwtProperties jwtProperties;

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            // Pad to minimum 256 bits for HMAC-SHA256
            byte[] padded = new byte[32];
            System.arraycopy(keyBytes, 0, padded, 0, Math.min(keyBytes.length, 32));
            keyBytes = padded;
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * Create access token (15 min TTL by default).
     */
    public String createAccessToken(String userId, String tenantId, String username) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + jwtProperties.getAccessTokenExpiration() * 1000);

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId)
                .issuer(jwtProperties.getIssuer())
                .claim("tenantId", tenantId)
                .claim("username", username)
                .claim("tokenType", "access")
                .issuedAt(now)
                .expiration(expiration)
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * Create refresh token (7 day TTL by default).
     */
    public String createRefreshToken(String userId, String tenantId, String username) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + jwtProperties.getRefreshTokenExpiration() * 1000);

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId)
                .issuer(jwtProperties.getIssuer())
                .claim("tenantId", tenantId)
                .claim("username", username)
                .claim("tokenType", "refresh")
                .issuedAt(now)
                .expiration(expiration)
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * Parse and validate token. Returns claims or throws.
     */
    public Jws<Claims> parseToken(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token);
    }

    /**
     * Extract token from "Bearer xxx" header.
     */
    public static String extractBearerToken(String header) {
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

    /**
     * Try to parse JWT without throwing (for audit purposes).
     */
    public Claims parseTokenQuietly(String token) {
        try {
            return parseToken(token).getPayload();
        } catch (Exception e) {
            return null;
        }
    }
}
