package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.TenantController.*;
import com.bls.server.entity.SysTenant;
import com.bls.server.mapper.SysTenantMapper;
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

    private final SysTenantMapper tenantMapper;

    public ApiResponse<List<Map<String, Object>>> listTenants(TenantQueryRequest request) {
        Page<SysTenant> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getDeleted, 0);

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
                .eq(SysTenant::getStatus, "0")
                .eq(SysTenant::getDeleted, 0));

        return tenants.stream().map(t -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("tenantId", t.getTenantId());
            map.put("tenantName", t.getTenantName());
            map.put("domainName", t.getDomainName());
            return map;
        }).collect(Collectors.toList());
    }

    @Transactional
    public void addTenant(TenantCreateRequest request) {
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
        SysTenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null) throw AppException.notFound("租户不存在");
        tenant.setStatus(status);
        tenantMapper.updateById(tenant);
    }

    @Transactional
    public void removeTenants(List<String> ids) {
        for (String tenantId : ids) {
            SysTenant tenant = tenantMapper.selectById(tenantId);
            if (tenant != null) {
                tenant.setDeleted(1);
                tenantMapper.updateById(tenant);
            }
        }
    }
}
