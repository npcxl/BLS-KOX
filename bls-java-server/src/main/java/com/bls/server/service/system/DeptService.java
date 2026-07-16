package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.DeptController.*;
import com.bls.server.entity.SysDept;
import com.bls.server.entity.SysUser;
import com.bls.server.mapper.SysDeptMapper;
import com.bls.server.mapper.SysUserMapper;
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
public class DeptService {

    private final SysDeptMapper deptMapper;
    private final SysUserMapper userMapper;

    public List<Map<String, Object>> getDeptTree() {
        String tenantId = TenantContext.getTenantId();
        log.info("getDeptTree: tenantId={}", tenantId);
        List<SysDept> depts = deptMapper.selectList(new LambdaQueryWrapper<SysDept>()
                .eq(SysDept::getTenantId, tenantId)
                .eq(SysDept::getDeleted, 0)
                .orderByAsc(SysDept::getSortNum));

        List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0));

        Map<String, List<Map<String, Object>>> usersByDept = users.stream()
                .collect(Collectors.groupingBy(
                        u -> u.getDeptId() != null ? u.getDeptId() : "",
                        Collectors.mapping(u -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("userId", u.getUserId());
                            m.put("username", u.getUsername());
                            m.put("nickname", u.getNickname());
                            return m;
                        }, Collectors.toList())));

        return buildTree(depts, "000000");
    }

    public List<Map<String, Object>> getDeptUsers(String deptId) {
        String tenantId = TenantContext.getTenantId();
        List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getDeptId, deptId)
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0));

        return users.stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", u.getUserId());
            m.put("username", u.getUsername());
            m.put("nickname", u.getNickname());
            m.put("status", u.getStatus());
            m.put("email", u.getEmail());
            m.put("phone", u.getPhone());
            m.put("deptId", u.getDeptId());
            return m;
        }).collect(Collectors.toList());
    }

    @Transactional
    public void addDept(DeptCreateRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysDept dept = new SysDept();
        dept.setTenantId(tenantId);
        dept.setParentId(request.getParentId());
        dept.setDeptName(request.getDeptName());
        dept.setSortNum(request.getSortNum());
        dept.setStatus(request.getStatus());
        deptMapper.insert(dept);
    }

    @Transactional
    public void editDept(DeptEditRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysDept dept = deptMapper.selectOne(new LambdaQueryWrapper<SysDept>()
                .eq(SysDept::getDeptId, request.getDeptId())
                .eq(SysDept::getTenantId, tenantId));

        if (dept == null) throw AppException.notFound("部门不存在");

        if (request.getParentId() != null) dept.setParentId(request.getParentId());
        if (request.getDeptName() != null) dept.setDeptName(request.getDeptName());
        if (request.getSortNum() != null) dept.setSortNum(request.getSortNum());
        if (request.getStatus() != null) dept.setStatus(request.getStatus());

        deptMapper.updateById(dept);
    }

    @Transactional
    public void removeDepts(List<String> ids) {
        String tenantId = TenantContext.getTenantId();
        for (String deptId : ids) {
            SysDept dept = deptMapper.selectOne(new LambdaQueryWrapper<SysDept>()
                    .eq(SysDept::getDeptId, deptId)
                    .eq(SysDept::getTenantId, tenantId));
            if (dept != null) {
                dept.setDeleted(1);
                deptMapper.updateById(dept);
            }
        }
    }

    private List<Map<String, Object>> buildTree(List<SysDept> depts, String parentId) {
        List<Map<String, Object>> tree = new ArrayList<>();
        for (SysDept dept : depts) {
            if (Objects.equals(parentId, dept.getParentId())) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("deptId", dept.getDeptId());
                node.put("parentId", dept.getParentId());
                node.put("deptName", dept.getDeptName());
                node.put("sortNum", dept.getSortNum());
                node.put("status", dept.getStatus());
                node.put("createTime", dept.getCreateTime());

                List<Map<String, Object>> children = buildTree(depts, dept.getDeptId());
                if (!children.isEmpty()) {
                    node.put("children", children);
                }
                tree.add(node);
            }
        }
        return tree;
    }
}
