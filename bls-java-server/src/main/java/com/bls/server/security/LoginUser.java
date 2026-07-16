package com.bls.server.security;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Current authenticated user, aligned with Koa CurrentUser.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginUser {

    private String userId;
    private String tenantId;
    private String username;
    private String nickname;
    private String realName;
    private String avatar;
    private String gender;
    private String email;
    private String phone;
    private String deptId;
    private String isAdmin;
    private String status;

    /** Permission identifiers like "system:user:list" */
    private List<String> permissions;

    /** Role keys with data scope */
    private List<RoleInfo> roles;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RoleInfo {
        private String roleKey;
        private String dataScope;
    }
}
