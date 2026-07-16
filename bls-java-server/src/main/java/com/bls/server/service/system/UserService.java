package com.bls.server.service.system;

import cn.hutool.crypto.digest.DigestUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.UserController.*;
import com.bls.server.entity.*;
import com.bls.server.mapper.*;
import com.bls.server.security.LoginUser;
import com.bls.server.security.JwtAuthenticationToken;
import com.bls.server.security.TenantContext;
import com.bls.server.service.SessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final SysUserMapper userMapper;
    private final SysUserRoleMapper userRoleMapper;
    private final SysRoleMapper roleMapper;
    private final SessionService sessionService;
    private final PasswordEncoder passwordEncoder;

    public ApiResponse<List<Map<String, Object>>> listUsers(UserQueryRequest request) {
        String tenantId = TenantContext.getTenantId();
        String currentUserId = TenantContext.getUserId();

        Page<SysUser> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0);

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            wrapper.and(w -> w
                .like(SysUser::getUsername, request.getKeyword())
                .or().like(SysUser::getNickname, request.getKeyword())
                .or().like(SysUser::getPhone, request.getKeyword())
                .or().like(SysUser::getEmail, request.getKeyword()));
        }

        wrapper.orderByDesc(SysUser::getCreateTime);

        IPage<SysUser> result = userMapper.selectPage(page, wrapper);

        List<Map<String, Object>> list = result.getRecords().stream().map(user -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("userId", user.getUserId());
            map.put("tenantId", user.getTenantId());
            map.put("username", user.getUsername());
            map.put("nickname", user.getNickname());
            map.put("realName", user.getRealName());
            map.put("avatar", user.getAvatar());
            map.put("gender", user.getGender());
            map.put("email", user.getEmail());
            map.put("phone", user.getPhone());
            map.put("deptId", user.getDeptId());
            map.put("isAdmin", user.getIsAdmin());
            map.put("status", user.getStatus());
            map.put("createTime", user.getCreateTime());
            map.put("remark", user.getRemark());

            // Load roles
            List<SysUserRole> userRoles = userRoleMapper.selectList(
                    new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, user.getUserId()));
            List<String> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toList());
            if (!roleIds.isEmpty()) {
                List<SysRole> roles = roleMapper.selectBatchIds(roleIds);
                map.put("roles", roles.stream().map(r -> {
                    Map<String, String> rm = new LinkedHashMap<>();
                    rm.put("roleId", r.getRoleId());
                    rm.put("roleName", r.getRoleName());
                    rm.put("roleKey", r.getRoleKey());
                    return rm;
                }).collect(Collectors.toList()));
            }
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    public Map<String, Object> getCurrentUserProfile() {
        String userId = TenantContext.getUserId();
        SysUser user = userMapper.selectById(userId);
        if (user == null) throw AppException.notFound("用户不存在");

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("userId", user.getUserId());
        map.put("username", user.getUsername());
        map.put("nickname", user.getNickname());
        map.put("realName", user.getRealName());
        map.put("avatar", user.getAvatar());
        map.put("gender", user.getGender());
        map.put("email", user.getEmail());
        map.put("phone", user.getPhone());
        map.put("deptId", user.getDeptId());
        return map;
    }

    @Transactional
    public void updateProfile(Map<String, Object> body) {
        String userId = TenantContext.getUserId();
        String tenantId = TenantContext.getTenantId();

        SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUserId, userId)
                .eq(SysUser::getTenantId, tenantId));

        if (user == null) throw AppException.notFound("用户不存在");

        // Whitelist fields for mass assignment protection
        Set<String> allowedFields = Set.of("nickname", "realName", "gender", "email", "phone", "avatar");
        for (Map.Entry<String, Object> entry : body.entrySet()) {
            if (allowedFields.contains(entry.getKey()) && entry.getValue() != null) {
                switch (entry.getKey()) {
                    case "nickname" -> user.setNickname(entry.getValue().toString());
                    case "realName" -> user.setRealName(entry.getValue().toString());
                    case "gender" -> user.setGender(entry.getValue().toString());
                    case "email" -> user.setEmail(entry.getValue().toString());
                    case "phone" -> user.setPhone(entry.getValue().toString());
                    case "avatar" -> user.setAvatar(entry.getValue().toString());
                }
            }
        }

        userMapper.updateById(user);
    }

    @Transactional
    public void addUser(UserCreateRequest request) {
        String tenantId = TenantContext.getTenantId();

        // Check duplicate username in tenant
        Long count = userMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, request.getUsername())
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0));
        if (count > 0) {
            throw AppException.badRequest("用户名已存在");
        }

        SysUser user = new SysUser();
        user.setTenantId(tenantId);
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setPasswordAlgorithm("argon2");
        user.setNickname(request.getNickname() != null ? request.getNickname() : request.getUsername());
        user.setRealName(request.getRealName());
        user.setGender(request.getGender() != null ? request.getGender() : "0");
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setDeptId(request.getDeptId());
        user.setIsAdmin(0);
        user.setStatus(request.getStatus() != null ? request.getStatus() : "0");

        userMapper.insert(user);

        // Assign roles
        if (request.getRoleIds() != null && !request.getRoleIds().isEmpty()) {
            for (String roleId : request.getRoleIds()) {
                SysUserRole userRole = new SysUserRole();
                userRole.setUserId(user.getUserId());
                userRole.setRoleId(roleId);
                userRoleMapper.insert(userRole);
            }
        }
    }

    @Transactional
    public void editUser(UserEditRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUserId, request.getUserId())
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0));

        if (user == null) throw AppException.notFound("用户不存在");

        // Whitelist fields
        if (request.getNickname() != null) user.setNickname(request.getNickname());
        if (request.getRealName() != null) user.setRealName(request.getRealName());
        if (request.getGender() != null) user.setGender(request.getGender());
        if (request.getEmail() != null) user.setEmail(request.getEmail());
        if (request.getPhone() != null) user.setPhone(request.getPhone());
        if (request.getDeptId() != null) user.setDeptId(request.getDeptId());
        if (request.getStatus() != null) user.setStatus(request.getStatus());

        userMapper.updateById(user);

        // Update roles
        if (request.getRoleIds() != null) {
            userRoleMapper.delete(new LambdaQueryWrapper<SysUserRole>()
                    .eq(SysUserRole::getUserId, request.getUserId()));
            for (String roleId : request.getRoleIds()) {
                SysUserRole userRole = new SysUserRole();
                userRole.setUserId(request.getUserId());
                userRole.setRoleId(roleId);
                userRoleMapper.insert(userRole);
            }
        }
    }

    @Transactional
    public void removeUsers(List<String> ids) {
        String tenantId = TenantContext.getTenantId();
        for (String userId : ids) {
            // Cross-tenant protection
            SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getUserId, userId)
                    .eq(SysUser::getTenantId, tenantId));
            if (user != null) {
                // Soft delete
                user.setDeleted(1);
                userMapper.updateById(user);

                // Remove role associations
                userRoleMapper.delete(new LambdaQueryWrapper<SysUserRole>()
                        .eq(SysUserRole::getUserId, userId));
            }
        }
    }

    @Transactional
    public void changePassword(String oldPassword, String newPassword) {
        String userId = TenantContext.getUserId();
        String tenantId = TenantContext.getTenantId();

        SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUserId, userId)
                .eq(SysUser::getTenantId, tenantId));

        if (user == null) throw AppException.notFound("用户不存在");

        // Verify old password
        String algorithm = user.getPasswordAlgorithm();
        boolean valid;
        if (algorithm == null || "md5".equals(algorithm)) {
            valid = DigestUtil.md5Hex(oldPassword).equalsIgnoreCase(user.getPassword());
        } else {
            valid = passwordEncoder.matches(oldPassword, user.getPassword());
        }

        if (!valid) {
            throw AppException.badRequest("旧密码错误");
        }

        // Update password
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setPasswordAlgorithm("argon2");
        userMapper.updateById(user);
    }

    public List<Map<String, Object>> getUserSessions(String userId) {
        String tenantId = TenantContext.getTenantId();
        // TODO: implement session listing
        return Collections.emptyList();
    }

    public void kickUsers(List<String> userIds) {
        String tenantId = TenantContext.getTenantId();
        for (String userId : userIds) {
            sessionService.revokeAllSessions(tenantId, userId);
        }
    }
}
