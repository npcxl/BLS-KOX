package com.bls.server.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collections;
import java.util.stream.Collectors;

/**
 * JWT-based authentication token holding the LoginUser.
 */
public class JwtAuthenticationToken extends AbstractAuthenticationToken {

    private final LoginUser loginUser;
    private final String token;

    public JwtAuthenticationToken(LoginUser loginUser, String token) {
        super(loginUser.getPermissions() != null
                ? loginUser.getPermissions().stream()
                    .map(p -> new SimpleGrantedAuthority("PERM_" + p))
                    .collect(Collectors.toList())
                : Collections.emptyList());
        this.loginUser = loginUser;
        this.token = token;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return token;
    }

    @Override
    public Object getPrincipal() {
        return loginUser;
    }

    public LoginUser getLoginUser() {
        return loginUser;
    }
}
