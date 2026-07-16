package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.controller.system.PackageController.*;
import com.bls.server.core.BaseCrudService;
import com.bls.server.entity.SysPackage;
import com.bls.server.entity.SysPackageMenu;
import com.bls.server.mapper.SysPackageMapper;
import com.bls.server.mapper.SysPackageMenuMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class PackageService extends BaseCrudService<SysPackage, SysPackageMapper, PkgCreateRequest, PkgEditRequest> {

    private final SysPackageMenuMapper packageMenuMapper;

    public PackageService(SysPackageMapper mapper, SysPackageMenuMapper packageMenuMapper) {
        super(mapper, SysPackage::new);
        this.packageMenuMapper = packageMenuMapper;
    }

    @Override
    public ApiResponse<List<Map<String, Object>>> list(int pageNum, int pageSize, String keyword) {
        return doList(pageNum, pageSize, keyword, w -> {
            if (keyword != null && !keyword.isBlank()) {
                w.like(SysPackage::getPackageName, keyword);
            }
        });
    }

    @Override
    protected Map<String, Object> toMap(SysPackage p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("packageId", p.getPackageId()); m.put("packageName", p.getPackageName());
        m.put("status", p.getStatus()); m.put("createTime", p.getCreateTime());
        m.put("remark", p.getRemark());
        return m;
    }

    @Override
    protected void assignCreate(SysPackage e, PkgCreateRequest r) {
        e.setPackageName(r.getPackageName()); e.setStatus(r.getStatus()); e.setRemark(r.getRemark());
    }

    @Override
    protected void assignEdit(SysPackage e, PkgEditRequest r) {
        if (r.getPackageName() != null) e.setPackageName(r.getPackageName());
        if (r.getStatus() != null) e.setStatus(r.getStatus());
        if (r.getRemark() != null) e.setRemark(r.getRemark());
    }

    @Override
    protected java.io.Serializable extractId(PkgEditRequest r) { return r.getPackageId(); }

    @Override
    @Transactional
    public void remove(List<String> ids) {
        for (String id : ids) {
            mapper.deleteById(id);
            packageMenuMapper.delete(new LambdaQueryWrapper<SysPackageMenu>().eq(SysPackageMenu::getPackageId, id));
        }
    }

    @Transactional
    public void addWithMenus(PkgCreateRequest r, List<String> menuIds) {
        add(r);
        SysPackage created = mapper.selectOne(new LambdaQueryWrapper<SysPackage>()
                .eq(SysPackage::getPackageName, r.getPackageName())
                .orderByDesc(SysPackage::getCreateTime).last("limit 1"));
        if (created != null && menuIds != null) {
            for (String mid : menuIds) {
                SysPackageMenu pm = new SysPackageMenu(); pm.setPackageId(created.getPackageId()); pm.setMenuId(mid);
                packageMenuMapper.insert(pm);
            }
        }
    }

    @Transactional
    public void editWithMenus(PkgEditRequest r, List<String> menuIds) {
        edit(r);
        if (menuIds != null) {
            packageMenuMapper.delete(new LambdaQueryWrapper<SysPackageMenu>().eq(SysPackageMenu::getPackageId, r.getPackageId()));
            for (String mid : menuIds) {
                SysPackageMenu pm = new SysPackageMenu(); pm.setPackageId(r.getPackageId()); pm.setMenuId(mid);
                packageMenuMapper.insert(pm);
            }
        }
    }

    public List<Map<String, Object>> getOptions() {
        return mapper.selectList(new LambdaQueryWrapper<SysPackage>().eq(SysPackage::getStatus, "0"))
                .stream().map(p -> Map.<String,Object>of("packageId",p.getPackageId(),"packageName",p.getPackageName()))
                .collect(Collectors.toList());
    }

    public List<String> getMenuIds(String packageId) {
        return packageMenuMapper.selectList(new LambdaQueryWrapper<SysPackageMenu>().eq(SysPackageMenu::getPackageId, packageId))
                .stream().map(SysPackageMenu::getMenuId).collect(Collectors.toList());
    }
}
