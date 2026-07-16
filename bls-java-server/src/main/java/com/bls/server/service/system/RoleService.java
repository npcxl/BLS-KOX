package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.RoleController.*;
import com.bls.server.entity.*;
import com.bls.server.mapper.*;
import com.bls.server.security.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RoleService {

    private final SysRoleMapper roleMapper;
    private final SysRoleMenuMapper roleMenuMapper;
    private final SysUserRoleMapper userRoleMapper;

    public ApiResponse<List<Map<String, Object>>> listRoles(RoleQueryRequest request) {
        String tenantId = TenantContext.getTenantId();

        Page<SysRole> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getTenantId, tenantId)
                .eq(SysRole::getDeleted, 0);

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            wrapper.and(w -> w
                .like(SysRole::getRoleName, request.getKeyword())
                .or().like(SysRole::getRoleKey, request.getKeyword()));
        }

        wrapper.orderByDesc(SysRole::getCreateTime);
        IPage<SysRole> result = roleMapper.selectPage(page, wrapper);

        List<Map<String, Object>> list = result.getRecords().stream().map(r -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("roleId", r.getRoleId());
            map.put("roleName", r.getRoleName());
            map.put("roleKey", r.getRoleKey());
            map.put("dataScope", r.getDataScope());
            map.put("status", r.getStatus());
            map.put("createTime", r.getCreateTime());
            map.put("remark", r.getRemark());
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    public List<String> getRoleMenuIds(String roleId) {
        List<SysRoleMenu> roleMenus = roleMenuMapper.selectList(
                new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, roleId));
        return roleMenus.stream().map(SysRoleMenu::getMenuId).collect(Collectors.toList());
    }

    @Transactional
    public void addRole(RoleCreateRequest request) {
        String tenantId = TenantContext.getTenantId();

        Long count = roleMapper.selectCount(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getRoleKey, request.getRoleKey())
                .eq(SysRole::getTenantId, tenantId)
                .eq(SysRole::getDeleted, 0));
        if (count > 0) throw AppException.badRequest("角色标识已存在");

        SysRole role = new SysRole();
        role.setTenantId(tenantId);
        role.setRoleName(request.getRoleName());
        role.setRoleKey(request.getRoleKey());
        role.setDataScope(request.getDataScope());
        role.setStatus(request.getStatus());
        role.setRemark(request.getRemark());
        roleMapper.insert(role);

        if (request.getMenuIds() != null) {
            for (String menuId : request.getMenuIds()) {
                SysRoleMenu rm = new SysRoleMenu();
                rm.setRoleId(role.getRoleId());
                rm.setMenuId(menuId);
                roleMenuMapper.insert(rm);
            }
        }
    }

    @Transactional
    public void editRole(RoleEditRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysRole role = roleMapper.selectOne(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getRoleId, request.getRoleId())
                .eq(SysRole::getTenantId, tenantId));

        if (role == null) throw AppException.notFound("角色不存在");

        if (request.getRoleName() != null) role.setRoleName(request.getRoleName());
        if (request.getRoleKey() != null) role.setRoleKey(request.getRoleKey());
        if (request.getDataScope() != null) role.setDataScope(request.getDataScope());
        if (request.getStatus() != null) role.setStatus(request.getStatus());
        if (request.getRemark() != null) role.setRemark(request.getRemark());
        roleMapper.updateById(role);

        if (request.getMenuIds() != null) {
            roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>()
                    .eq(SysRoleMenu::getRoleId, request.getRoleId()));
            for (String menuId : request.getMenuIds()) {
                SysRoleMenu rm = new SysRoleMenu();
                rm.setRoleId(request.getRoleId());
                rm.setMenuId(menuId);
                roleMenuMapper.insert(rm);
            }
        }
    }

    @Transactional
    public void assignMenus(String roleId, List<String> menuIds) {
        roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>()
                .eq(SysRoleMenu::getRoleId, roleId));
        for (String menuId : menuIds) {
            SysRoleMenu rm = new SysRoleMenu();
            rm.setRoleId(roleId);
            rm.setMenuId(menuId);
            roleMenuMapper.insert(rm);
        }
    }

    @Transactional
    public void removeRoles(List<String> ids) {
        String tenantId = TenantContext.getTenantId();
        for (String roleId : ids) {
            SysRole role = roleMapper.selectOne(new LambdaQueryWrapper<SysRole>()
                    .eq(SysRole::getRoleId, roleId)
                    .eq(SysRole::getTenantId, tenantId));
            if (role != null) {
                role.setDeleted(1);
                roleMapper.updateById(role);
                roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, roleId));
                userRoleMapper.delete(new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, roleId));
            }
        }
    }
}
