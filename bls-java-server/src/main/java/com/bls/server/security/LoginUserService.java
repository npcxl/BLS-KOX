package com.bls.server.security;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.entity.*;
import com.bls.server.mapper.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoginUserService {

    private final SysUserMapper userMapper;
    private final SysUserRoleMapper userRoleMapper;
    private final SysRoleMapper roleMapper;
    private final SysRoleMenuMapper roleMenuMapper;
    private final SysMenuMapper menuMapper;

    public LoginUser loadUser(String userId, String tenantId) {
        SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUserId, userId)
                .eq(SysUser::getDeleted, 0));
        if (user == null || !"0".equals(user.getStatus())) {
            return null;
        }

        // Load roles
        List<SysUserRole> userRoles = userRoleMapper.selectList(
                new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, userId));
        List<String> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toList());

        List<LoginUser.RoleInfo> roles;
        List<String> permissions;

        if (roleIds.isEmpty()) {
            roles = Collections.emptyList();
            permissions = Collections.emptyList();
        } else {
            List<SysRole> roleList = roleMapper.selectList(
                    new LambdaQueryWrapper<SysRole>().in(SysRole::getRoleId, roleIds));
            roles = roleList.stream()
                    .filter(r -> "0".equals(r.getStatus()) && r.getDeleted() == 0)
                    .map(r -> LoginUser.RoleInfo.builder()
                            .roleKey(r.getRoleKey())
                            .dataScope(r.getDataScope())
                            .build())
                    .collect(Collectors.toList());

            // Load permissions via role-menu association
            List<SysRoleMenu> roleMenus = roleMenuMapper.selectList(
                    new LambdaQueryWrapper<SysRoleMenu>().in(SysRoleMenu::getRoleId, roleIds));
            List<String> menuIds = roleMenus.stream()
                    .map(SysRoleMenu::getMenuId)
                    .distinct()
                    .collect(Collectors.toList());

            if (menuIds.isEmpty()) {
                permissions = Collections.emptyList();
            } else {
                List<SysMenu> menus = menuMapper.selectList(
                        new LambdaQueryWrapper<SysMenu>().in(SysMenu::getMenuId, menuIds));
                permissions = menus.stream()
                        .map(SysMenu::getPerms)
                        .filter(p -> p != null && !p.isEmpty())
                        .distinct()
                        .collect(Collectors.toList());
            }
        }

        return LoginUser.builder()
                .userId(user.getUserId())
                .tenantId(user.getTenantId())
                .username(user.getUsername())
                .nickname(user.getNickname())
                .realName(user.getRealName())
                .avatar(user.getAvatar())
                .gender(user.getGender())
                .email(user.getEmail())
                .phone(user.getPhone())
                .deptId(user.getDeptId())
                .isAdmin(user.getIsAdmin())
                .status(user.getStatus())
                .roles(roles)
                .permissions(permissions)
                .build();
    }
}
