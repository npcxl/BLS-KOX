package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.TenantController.*;
import com.bls.server.entity.SysRole;
import com.bls.server.entity.SysTenant;
import com.bls.server.entity.SysUser;
import com.bls.server.mapper.SysRoleMapper;
import com.bls.server.mapper.SysTenantMapper;
import com.bls.server.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantService {

    /** 平台租户 ID（与 Koa / sql/Init.sql 一致） */
    private static final String PLATFORM_TENANT_ID = "000000";

    private final SysTenantMapper tenantMapper;
    private final SysUserMapper userMapper;
    private final SysRoleMapper roleMapper;

    public ApiResponse<List<Map<String, Object>>> listTenants(TenantQueryRequest request) {
        Page<SysTenant> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            wrapper.and(w -> w
                .like(SysTenant::getTenantName, request.getKeyword())
                .or().like(SysTenant::getDomainName, request.getKeyword())
                .or().like(SysTenant::getContactUser, request.getKeyword()));
        }

        wrapper.orderByDesc(SysTenant::getCreateTime);
        IPage<SysTenant> result = tenantMapper.selectPage(page, wrapper);

        List<Map<String, Object>> list = result.getRecords().stream().map(t -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("tenantId", t.getTenantId());
            map.put("tenantName", t.getTenantName());
            map.put("domainName", t.getDomainName());
            map.put("packageId", t.getPackageId());
            map.put("contactUser", t.getContactUser());
            map.put("contactPhone", t.getContactPhone());
            map.put("status", t.getStatus());
            map.put("expireTime", t.getExpireTime());
            map.put("createTime", t.getCreateTime());
            map.put("remark", t.getRemark());
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    public List<Map<String, Object>> getPublicTenantList() {
        List<SysTenant> tenants = tenantMapper.selectList(new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getStatus, "0"));

        return tenants.stream().map(t -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("tenantId", t.getTenantId());
            map.put("tenantName", t.getTenantName());
            map.put("domainName", t.getDomainName());
            return map;
        }).collect(Collectors.toList());
    }

    /** 域名唯一校验（uk_tenant_domain），排除自身 */
    private void assertDomainAvailable(String domainName, String excludeTenantId) {
        if (domainName == null || domainName.isBlank()) {
            return;
        }
        SysTenant exist = tenantMapper.selectOne(new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getDomainName, domainName.trim())
                .last("limit 1"));
        if (exist != null && !exist.getTenantId().equals(excludeTenantId)) {
            throw AppException.conflict("域名已被占用：" + domainName);
        }
    }

    /** 统计租户下仍有效的用户/角色数量（删除或停用前的关联检查） */
    private void assertNoTenantAssets(String tenantId) {
        Long users = userMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getTenantId, tenantId));
        Long roles = roleMapper.selectCount(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getTenantId, tenantId));
        long userCount = users == null ? 0 : users;
        long roleCount = roles == null ? 0 : roles;
        if (userCount > 0 || roleCount > 0) {
            throw AppException.conflict(
                    "租户下仍有 " + userCount + " 个用户 / " + roleCount + " 个角色，请先清理关联数据");
        }
    }

    @Transactional
    public void addTenant(TenantCreateRequest request) {
        assertDomainAvailable(request.getDomainName(), null);
        SysTenant tenant = new SysTenant();
        tenant.setTenantName(request.getTenantName());
        tenant.setDomainName(request.getDomainName());
        tenant.setPackageId(request.getPackageId());
        tenant.setContactUser(request.getContactName());
        tenant.setContactPhone(request.getContactPhone());
        tenant.setStatus(request.getStatus());
        tenant.setRemark(request.getRemark());
        tenantMapper.insert(tenant);
    }

    @Transactional
    public void editTenant(TenantEditRequest request) {
        SysTenant tenant = tenantMapper.selectById(request.getTenantId());
        if (tenant == null) throw AppException.notFound("租户不存在");

        if (request.getDomainName() != null) {
            assertDomainAvailable(request.getDomainName(), request.getTenantId());
        }

        if (request.getTenantName() != null) tenant.setTenantName(request.getTenantName());
        if (request.getDomainName() != null) tenant.setDomainName(request.getDomainName());
        if (request.getPackageId() != null) tenant.setPackageId(request.getPackageId());
        if (request.getContactName() != null) tenant.setContactUser(request.getContactName());
        if (request.getContactPhone() != null) tenant.setContactPhone(request.getContactPhone());
        if (request.getStatus() != null) tenant.setStatus(request.getStatus());
        if (request.getRemark() != null) tenant.setRemark(request.getRemark());

        tenantMapper.updateById(tenant);
    }

    @Transactional
    public void updateStatus(String tenantId, String status) {
        if (PLATFORM_TENANT_ID.equals(tenantId)) {
            throw AppException.forbidden("平台租户不允许停用");
        }
        SysTenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null) throw AppException.notFound("租户不存在");
        if ("1".equals(status)) {
            assertNoTenantAssets(tenantId);
        }
        tenant.setStatus(status);
        tenantMapper.updateById(tenant);
    }

    @Transactional
    public void removeTenants(List<String> ids) {
        for (String tenantId : ids) {
            if (PLATFORM_TENANT_ID.equals(tenantId)) {
                throw AppException.forbidden("平台租户不允许删除");
            }
            SysTenant tenant = tenantMapper.selectById(tenantId);
            if (tenant == null) {
                throw AppException.notFound("租户不存在");
            }
            assertNoTenantAssets(tenantId);
            // SysTenant 带 @TableLogic，deleteById 实际为逻辑删除
            tenantMapper.deleteById(tenantId);
        }
    }
}
