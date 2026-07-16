package com.bls.server.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.DigestUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.AppException;
import com.bls.server.entity.*;
import com.bls.server.mapper.*;
import com.bls.server.security.JwtTokenProvider;
import com.bls.server.security.LoginUser;
import com.bls.server.security.LoginUser.RoleInfo;
import com.bls.server.security.LoginUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final SysUserMapper userMapper;
    private final SysTenantMapper tenantMapper;
    private final SysUserRoleMapper userRoleMapper;
    private final SysRoleMapper roleMapper;
    private final SysRoleMenuMapper roleMenuMapper;
    private final SysMenuMapper menuMapper;
    private final SysLoginLogMapper loginLogMapper;
    private final JwtTokenProvider jwtTokenProvider;
    private final LoginUserService loginUserService;
    private final SessionService sessionService;
    private final PasswordEncoder passwordEncoder;

    /**
     * Login by tenantId directly (when provided in request).
     * Aligned with Koa loginByTenant.
     */
    @Transactional
    public Map<String, Object> loginByTenant(String tenantId, String username, String password,
                                              String ip, String userAgent) {
        // Query user
        SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, username)
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0));

        if (user == null) {
            writeLoginLog(tenantId, null, username, ip, userAgent, "0", "用户不存在");
            throw AppException.unauthorized("用户名或密码错误");
        }

        // Verify password - support both Argon2 and MD5 (legacy)
        boolean passwordValid = verifyPassword(password, user.getPassword(), user.getPasswordAlgorithm());
        if (!passwordValid) {
            writeLoginLog(tenantId, user.getUserId(), username, ip, userAgent, "0", "密码错误");
            throw AppException.unauthorized("用户名或密码错误");
        }

        // Check if user is active
        if (!"0".equals(user.getStatus())) {
            writeLoginLog(tenantId, user.getUserId(), username, ip, userAgent, "0", "用户已被停用");
            throw AppException.unauthorized("用户已被停用");
        }

        // Check if multi-login is enabled (from config)
        boolean multiLoginEnabled = isMultiLoginEnabled(tenantId);

        // Generate tokens
        String accessToken = jwtTokenProvider.createAccessToken(user.getUserId(), tenantId, username);
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getUserId(), tenantId, username);

        // Parse JTI from tokens
        String accessJti = jwtTokenProvider.parseToken(accessToken).getPayload().getId();
        String refreshJti = jwtTokenProvider.parseToken(refreshToken).getPayload().getId();

        // Session management
        if (!multiLoginEnabled) {
            // Revoke all old sessions
            sessionService.revokeAllSessions(tenantId, user.getUserId());
        }

        // Create session records
        sessionService.createSession(tenantId, user.getUserId(), "acc:" + accessJti);
        sessionService.createSession(tenantId, user.getUserId(), "ref:" + refreshJti);

        // Store auth session for refresh token rotation
        String refreshTokenHash = DigestUtil.sha256Hex(refreshToken);
        sessionService.storeAuthSession(accessJti, refreshJti, user.getUserId(), tenantId, refreshTokenHash);

        // Load user profile
        LoginUser profile = loginUserService.loadUser(user.getUserId(), tenantId);

        // Build menu tree
        List<Map<String, Object>> menus = buildMenuTree(user.getUserId());

        // Write login log
        writeLoginLog(tenantId, user.getUserId(), username, ip, userAgent, "1", "登录成功");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("token", "Bearer " + accessToken);
        result.put("refreshToken", refreshToken);
        Map<String, Object> userData = new LinkedHashMap<>();
        userData.put("userId", profile.getUserId());
        userData.put("tenantId", profile.getTenantId());
        userData.put("username", profile.getUsername());
        userData.put("nickname", profile.getNickname());
        userData.put("permissions", profile.getPermissions());
        userData.put("roles", profile.getRoles());
        userData.put("menus", menus);
        result.put("user", userData);

        return result;
    }

    /**
     * Login by domain (when tenantId not provided, match by Origin/domain).
     */
    @Transactional
    public Map<String, Object> loginByDomain(String domainName, String username, String password,
                                              String ip, String userAgent) {
        SysTenant tenant = tenantMapper.selectOne(new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getDomainName, domainName)
                .eq(SysTenant::getStatus, "0"));

        if (tenant == null) {
            // Fallback to platform tenant
            tenant = tenantMapper.selectOne(new LambdaQueryWrapper<SysTenant>()
                    .eq(SysTenant::getTenantId, "000000"));
        }

        if (tenant == null) {
            throw AppException.unauthorized("当前域名未绑定租户");
        }

        return loginByTenant(tenant.getTenantId(), username, password, ip, userAgent);
    }

    /**
     * Get current user profile with roles, permissions, and menus.
     */
    public Map<String, Object> getProfile(String userId, String tenantId) {
        LoginUser profile = loginUserService.loadUser(userId, tenantId);
        if (profile == null) {
            throw AppException.unauthorized("用户不存在");
        }

        List<Map<String, Object>> menus = buildMenuTree(userId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", profile.getUserId());
        result.put("tenantId", profile.getTenantId());
        result.put("username", profile.getUsername());
        result.put("nickname", profile.getNickname());
        result.put("realName", profile.getRealName());
        result.put("avatar", profile.getAvatar());
        result.put("gender", profile.getGender());
        result.put("email", profile.getEmail());
        result.put("phone", profile.getPhone());
        result.put("deptId", profile.getDeptId());
        result.put("isAdmin", profile.getIsAdmin());
        result.put("status", profile.getStatus());
        result.put("permissions", profile.getPermissions());
        result.put("roles", profile.getRoles());
        result.put("menus", menus);

        return result;
    }

    /**
     * Refresh access token with token rotation and reuse detection.
     */
    public Map<String, Object> refreshToken(String refreshToken, String ip, String userAgent) {
        var claims = jwtTokenProvider.parseToken(refreshToken).getPayload();
        String tokenType = claims.get("tokenType", String.class);
        if (!"refresh".equals(tokenType)) {
            throw AppException.sessionInvalid("无效的刷新令牌");
        }

        String userId = claims.getSubject();
        String tenantId = claims.get("tenantId", String.class);
        String refreshJti = claims.getId();

        // Validate refresh session
        if (!sessionService.validateSession(tenantId, userId, "ref:" + refreshJti)) {
            throw AppException.sessionInvalid("会话已失效，请重新登录");
        }

        // Generate new token pair
        String username = claims.get("username", String.class);
        String newAccessToken = jwtTokenProvider.createAccessToken(userId, tenantId, username);
        String newRefreshToken = jwtTokenProvider.createRefreshToken(userId, tenantId, username);

        String newAccessJti = jwtTokenProvider.parseToken(newAccessToken).getPayload().getId();
        String newRefreshJti = jwtTokenProvider.parseToken(newRefreshToken).getPayload().getId();

        // Revoke old sessions
        sessionService.revokeSession(tenantId, userId, "acc:" + refreshJti);
        sessionService.revokeSession(tenantId, userId, "ref:" + refreshJti);

        // Create new sessions
        sessionService.createSession(tenantId, userId, "acc:" + newAccessJti);
        sessionService.createSession(tenantId, userId, "ref:" + newRefreshJti);

        String refreshTokenHash = DigestUtil.sha256Hex(newRefreshToken);
        sessionService.storeAuthSession(newAccessJti, newRefreshJti, userId, tenantId, refreshTokenHash);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("token", "Bearer " + newAccessToken);
        result.put("refreshToken", newRefreshToken);
        return result;
    }

    /**
     * Logout - clear Redis sessions.
     */
    public void logout(String userId, String tenantId, String accessToken) {
        if (StrUtil.isNotBlank(accessToken)) {
            try {
                var claims = jwtTokenProvider.parseToken(accessToken).getPayload();
                String accessJti = claims.getId();

                // Get stored session to also revoke refresh token
                SessionService.AuthSessionData authSession = sessionService.getAuthSession(accessJti);
                if (authSession != null) {
                    sessionService.revokeSession(tenantId, userId, "ref:" + authSession.getRefreshJti());
                }
                sessionService.revokeSession(tenantId, userId, "acc:" + accessJti);
                sessionService.deleteAuthSession(accessJti);
            } catch (Exception e) {
                log.debug("Logout: failed to parse token, continuing cleanup: {}", e.getMessage());
            }
        }
        // Revoke all sessions for this user
        sessionService.revokeAllSessions(tenantId, userId);
    }

    private boolean verifyPassword(String rawPassword, String storedHash, String algorithm) {
        log.debug("verifyPassword: raw={}, algorithm={}, hashPrefix={}",
                rawPassword, algorithm,
                storedHash != null && storedHash.length() > 20 ? storedHash.substring(0, 20) : storedHash);
        if (algorithm == null || "md5".equals(algorithm)) {
            // Aligned with Koa verifyPasswordMd5:
            // If the input is already a 32-char hex MD5, compare directly.
            // Otherwise MD5 the raw input first.
            String inputHash = rawPassword.length() == 32 && rawPassword.matches("[a-fA-F0-9]+")
                    ? rawPassword
                    : DigestUtil.md5Hex(rawPassword);
            return inputHash.equalsIgnoreCase(storedHash);
        }
        // Argon2 / argon2id — Koa sends MD5(password) to argon2.verify()
        // So the raw input IS the MD5 of the original password, pass it directly.
        try {
            return passwordEncoder.matches(rawPassword, storedHash);
        } catch (Exception e) {
            log.warn("Password verification failed: {}", e.getMessage());
            return false;
        }
    }

    private boolean isMultiLoginEnabled(String tenantId) {
        // Check sys_config for multi-login setting
        // Default: not enabled (single login only)
        return false;
    }

    private List<Map<String, Object>> buildMenuTree(String userId) {
        // Load role IDs
        List<SysUserRole> userRoles = userRoleMapper.selectList(
                new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, userId));
        List<String> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toList());
        log.info("buildMenuTree: userId={}, roleIds={}", userId, roleIds);

        if (roleIds.isEmpty()) return Collections.emptyList();

        // Load menu IDs from role-menu
        List<SysRoleMenu> roleMenus = roleMenuMapper.selectList(
                new LambdaQueryWrapper<SysRoleMenu>().in(SysRoleMenu::getRoleId, roleIds));
        List<String> menuIds = roleMenus.stream()
                .map(SysRoleMenu::getMenuId).distinct().collect(Collectors.toList());
        log.info("buildMenuTree: roleMenus count={}, menuIds={}", roleMenus.size(), menuIds.size());

        if (menuIds.isEmpty()) return Collections.emptyList();

        // Load menus
        List<SysMenu> menus = menuMapper.selectList(
                new LambdaQueryWrapper<SysMenu>().in(SysMenu::getMenuId, menuIds));
        log.info("buildMenuTree: menus count={}", menus.size());
        List<SysMenu> filteredMenus = menus.stream()
                .filter(m -> ("0".equals(m.getMenuType()) || "1".equals(m.getMenuType()))
                        && "0".equals(m.getStatus()))
                .sorted(Comparator.comparing(SysMenu::getSortNum, Comparator.nullsLast(Comparator.naturalOrder())))
                .collect(Collectors.toList());

        return buildTree(filteredMenus, "000000");
    }

    private List<Map<String, Object>> buildTree(List<SysMenu> menus, String parentId) {
        List<Map<String, Object>> tree = new ArrayList<>();
        for (SysMenu menu : menus) {
            if (Objects.equals(parentId, menu.getParentId())) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("menuId", menu.getMenuId());
                node.put("parentId", menu.getParentId());
                node.put("menuName", menu.getMenuName());
                node.put("path", menu.getPath());
                node.put("component", menu.getComponent());
                node.put("icon", menu.getIcon());
                node.put("menuType", menu.getMenuType());
                node.put("sortNum", menu.getSortNum());
                List<Map<String, Object>> children = buildTree(menus, menu.getMenuId());
                if (!children.isEmpty()) {
                    node.put("children", children);
                }
                tree.add(node);
            }
        }
        return tree;
    }

    private void writeLoginLog(String tenantId, String userId, String username,
                                String ip, String userAgent, String status, String msg) {
        try {
            SysLoginLog logEntry = new SysLoginLog();
            logEntry.setTenantId(tenantId);
            logEntry.setUserId(userId);
            logEntry.setUsername(username);
            logEntry.setLoginIp(ip);
            logEntry.setUserAgent(userAgent);
            logEntry.setLoginType("password");
            logEntry.setLoginStatus(status);
            logEntry.setFailReason("0".equals(status) ? msg : null);
            logEntry.setLoginTime(java.time.LocalDateTime.now());
            loginLogMapper.insert(logEntry);
        } catch (Exception e) {
            log.error("Failed to write login log", e);
        }
    }
}
