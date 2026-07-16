package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.controller.system.ConfigController.*;
import com.bls.server.core.BaseCrudService;
import com.bls.server.entity.SysConfig;
import com.bls.server.mapper.SysConfigMapper;
import com.bls.server.security.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class ConfigService extends BaseCrudService<SysConfig, SysConfigMapper, ConfigCreateRequest, ConfigEditRequest> {

    public ConfigService(SysConfigMapper mapper) { super(mapper, SysConfig::new); }

    @Override
    public ApiResponse<List<Map<String, Object>>> list(int pageNum, int pageSize, String keyword) {
        return doList(pageNum, pageSize, keyword, w -> {
            if (keyword != null && !keyword.isBlank()) {
                w.and(ww -> ww.like(SysConfig::getConfigName, keyword).or().like(SysConfig::getConfigKey, keyword));
            }
        });
    }

    @Override
    protected Map<String, Object> toMap(SysConfig c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("configId", c.getConfigId()); m.put("configName", c.getConfigName());
        m.put("configKey", c.getConfigKey()); m.put("configValue", c.getConfigValue());
        m.put("configType", c.getConfigType()); m.put("status", c.getStatus());
        m.put("createTime", c.getCreateTime()); m.put("remark", c.getRemark());
        return m;
    }

    @Override
    protected void assignCreate(SysConfig e, ConfigCreateRequest r) {
        e.setTenantId(TenantContext.getTenantId());
        e.setConfigName(r.getConfigName()); e.setConfigKey(r.getConfigKey());
        e.setConfigValue(r.getConfigValue()); e.setConfigType(r.getConfigType());
        e.setStatus(r.getStatus()); e.setRemark(r.getRemark());
    }

    @Override
    protected void assignEdit(SysConfig e, ConfigEditRequest r) {
        if (r.getConfigName() != null) e.setConfigName(r.getConfigName());
        if (r.getConfigKey() != null) e.setConfigKey(r.getConfigKey());
        if (r.getConfigValue() != null) e.setConfigValue(r.getConfigValue());
        if (r.getConfigType() != null) e.setConfigType(r.getConfigType());
        if (r.getStatus() != null) e.setStatus(r.getStatus());
        if (r.getRemark() != null) e.setRemark(r.getRemark());
    }

    @Override
    protected java.io.Serializable extractId(ConfigEditRequest r) { return r.getConfigId(); }

    @Override
    public void remove(List<String> ids) {
        for (String id : ids) {
            SysConfig c = mapper.selectById(id);
            if (c != null) { c.setDeleted(1); mapper.updateById(c); }
        }
    }

    public SysConfig getByKey(String tenantId, String configKey) {
        return mapper.selectOne(new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getTenantId, tenantId)
                .eq(SysConfig::getConfigKey, configKey)
                .eq(SysConfig::getDeleted, 0));
    }

    public SysConfig getPublicConfig(String configKey) {
        return mapper.selectOne(new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getConfigKey, configKey).last("limit 1"));
    }
}
