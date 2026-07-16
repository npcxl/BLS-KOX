package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.controller.system.RoleController.*;
import com.bls.server.core.BaseCrudService;
import com.bls.server.entity.SysRole;
import com.bls.server.entity.SysRoleMenu;
import com.bls.server.entity.SysUserRole;
import com.bls.server.mapper.SysRoleMapper;
import com.bls.server.mapper.SysRoleMenuMapper;
import com.bls.server.mapper.SysUserRoleMapper;
import com.bls.server.security.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RoleService extends BaseCrudService<SysRole, SysRoleMapper, RoleCreateRequest, RoleEditRequest> {

    private final SysRoleMenuMapper roleMenuMapper;
    private final SysUserRoleMapper userRoleMapper;

    public RoleService(SysRoleMapper mapper, SysRoleMenuMapper roleMenuMapper, SysUserRoleMapper userRoleMapper) {
        super(mapper);
        this.roleMenuMapper = roleMenuMapper;
        this.userRoleMapper = userRoleMapper;
    }

    @Override
    public ApiResponse<List<Map<String, Object>>> list(int pageNum, int pageSize, String keyword) {
        return doList(pageNum, pageSize, keyword, w -> {
            if (keyword != null && !keyword.isBlank()) {
                w.and(ww -> ww.like(SysRole::getRoleName, keyword).or().like(SysRole::getRoleKey, keyword));
            }
        });
    }

    @Override
    protected Map<String, Object> toMap(SysRole r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("roleId", r.getRoleId()); m.put("roleName", r.getRoleName());
        m.put("roleKey", r.getRoleKey()); m.put("dataScope", r.getDataScope());
        m.put("status", r.getStatus()); m.put("createTime", r.getCreateTime());
        m.put("remark", r.getRemark());
        return m;
    }

    @Override
    protected void assignCreate(SysRole e, RoleCreateRequest r) {
        e.setTenantId(TenantContext.getTenantId());
        e.setRoleName(r.getRoleName()); e.setRoleKey(r.getRoleKey());
        e.setDataScope(r.getDataScope()); e.setStatus(r.getStatus());
        e.setRemark(r.getRemark());
    }

    @Override
    protected void assignEdit(SysRole e, RoleEditRequest r) {
        if (r.getRoleName() != null) e.setRoleName(r.getRoleName());
        if (r.getRoleKey() != null) e.setRoleKey(r.getRoleKey());
        if (r.getDataScope() != null) e.setDataScope(r.getDataScope());
        if (r.getStatus() != null) e.setStatus(r.getStatus());
        if (r.getRemark() != null) e.setRemark(r.getRemark());
    }

    @Override
    protected java.io.Serializable extractId(RoleEditRequest r) { return r.getRoleId(); }

    @Override
    @Transactional
    public void remove(List<String> ids) {
        for (String id : ids) {
            SysRole role = mapper.selectById(id);
            if (role != null) {
                role.setDeleted(1); mapper.updateById(role);
                roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, id));
                userRoleMapper.delete(new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, id));
            }
        }
    }

    @Transactional
    public void addWithMenus(RoleCreateRequest r, List<String> menuIds) {
        add(r);
        SysRole created = mapper.selectOne(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getRoleKey, r.getRoleKey())
                .eq(SysRole::getTenantId, TenantContext.getTenantId())
                .orderByDesc(SysRole::getCreateTime).last("limit 1"));
        if (created != null && menuIds != null) {
            for (String mid : menuIds) {
                SysRoleMenu rm = new SysRoleMenu(); rm.setRoleId(created.getRoleId()); rm.setMenuId(mid);
                roleMenuMapper.insert(rm);
            }
        }
    }

    @Transactional
    public void editWithMenus(RoleEditRequest r, List<String> menuIds) {
        edit(r);
        if (menuIds != null) {
            roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, r.getRoleId()));
            for (String mid : menuIds) {
                SysRoleMenu rm = new SysRoleMenu(); rm.setRoleId(r.getRoleId()); rm.setMenuId(mid);
                roleMenuMapper.insert(rm);
            }
        }
    }

    public List<String> getRoleMenuIds(String roleId) {
        return roleMenuMapper.selectList(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, roleId))
                .stream().map(SysRoleMenu::getMenuId).collect(Collectors.toList());
    }

    public void assignMenus(String roleId, List<String> menuIds) {
        roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, roleId));
        for (String mid : menuIds) {
            SysRoleMenu rm = new SysRoleMenu(); rm.setRoleId(roleId); rm.setMenuId(mid);
            roleMenuMapper.insert(rm);
        }
    }
}
