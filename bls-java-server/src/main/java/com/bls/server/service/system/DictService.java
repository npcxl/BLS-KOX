package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.DictController.*;
import com.bls.server.entity.SysDictData;
import com.bls.server.entity.SysDictType;
import com.bls.server.mapper.SysDictDataMapper;
import com.bls.server.mapper.SysDictTypeMapper;
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
public class DictService {

    private final SysDictTypeMapper dictTypeMapper;
    private final SysDictDataMapper dictDataMapper;

    public ApiResponse<List<Map<String, Object>>> listDictTypes(DictTypeQueryRequest request) {
        String tenantId = TenantContext.getTenantId();
        Page<SysDictType> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysDictType> wrapper = new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getTenantId, tenantId)
                .eq(SysDictType::getDeleted, 0);

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            wrapper.and(w -> w
                .like(SysDictType::getDictName, request.getKeyword())
                .or().like(SysDictType::getDictType, request.getKeyword()));
        }

        IPage<SysDictType> result = dictTypeMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(t -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("dictTypeId", t.getDictTypeId());
            map.put("dictName", t.getDictName());
            map.put("dictType", t.getDictType());
            map.put("status", t.getStatus());
            map.put("createTime", t.getCreateTime());
            map.put("remark", t.getRemark());
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Transactional
    public void addDictType(DictTypeCreateRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysDictType dictType = new SysDictType();
        dictType.setTenantId(tenantId);
        dictType.setDictName(request.getDictName());
        dictType.setDictType(request.getDictType());
        dictType.setStatus(request.getStatus());
        dictType.setRemark(request.getRemark());
        dictTypeMapper.insert(dictType);
    }

    @Transactional
    public void editDictType(DictTypeEditRequest request) {
        SysDictType dictType = dictTypeMapper.selectById(request.getDictTypeId());
        if (dictType == null) throw AppException.notFound("字典类型不存在");
        if (request.getDictName() != null) dictType.setDictName(request.getDictName());
        if (request.getDictType() != null) dictType.setDictType(request.getDictType());
        if (request.getStatus() != null) dictType.setStatus(request.getStatus());
        if (request.getRemark() != null) dictType.setRemark(request.getRemark());
        dictTypeMapper.updateById(dictType);
    }

    @Transactional
    public void removeDictTypes(List<String> ids) {
        for (String id : ids) {
            SysDictType dictType = dictTypeMapper.selectById(id);
            if (dictType != null) {
                dictType.setDeleted(1);
                dictTypeMapper.updateById(dictType);
                // Also remove associated data
                dictDataMapper.delete(new LambdaQueryWrapper<SysDictData>()
                        .eq(SysDictData::getDictType, dictType.getDictType()));
            }
        }
    }

    public ApiResponse<List<Map<String, Object>>> listDictData(DictDataQueryRequest request) {
        String tenantId = TenantContext.getTenantId();
        Page<SysDictData> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysDictData> wrapper = new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getTenantId, tenantId)
                .eq(SysDictData::getDictType, request.getDictType())
                .eq(SysDictData::getDeleted, 0)
                .orderByAsc(SysDictData::getSortNum);

        IPage<SysDictData> result = dictDataMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(d -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("dictDataId", d.getDictDataId());
            map.put("dictType", d.getDictType());
            map.put("dictLabel", d.getDictLabel());
            map.put("dictValue", d.getDictValue());
            map.put("cssClass", d.getCssClass());
            map.put("listClass", d.getListClass());
            map.put("sortNum", d.getSortNum());
            map.put("status", d.getStatus());
            map.put("isDefault", d.getIsDefault());
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    public List<Map<String, Object>> getDictDataByType(String dictType) {
        String tenantId = TenantContext.getTenantId();
        List<SysDictData> data = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getTenantId, tenantId)
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, "0")
                .eq(SysDictData::getDeleted, 0)
                .orderByAsc(SysDictData::getSortNum));

        return data.stream().map(d -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("dictDataId", d.getDictDataId());
            map.put("dictLabel", d.getDictLabel());
            map.put("dictValue", d.getDictValue());
            map.put("cssClass", d.getCssClass());
            map.put("listClass", d.getListClass());
            map.put("isDefault", d.getIsDefault());
            return map;
        }).collect(Collectors.toList());
    }

    @Transactional
    public void addDictData(DictDataCreateRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysDictData data = new SysDictData();
        data.setTenantId(tenantId);
        data.setDictType(request.getDictType());
        data.setDictLabel(request.getDictLabel());
        data.setDictValue(request.getDictValue());
        data.setCssClass(request.getCssClass());
        data.setListClass(request.getListClass());
        data.setSortNum(request.getSortNum());
        data.setStatus(request.getStatus());
        data.setIsDefault(request.getIsDefault());
        dictDataMapper.insert(data);
    }

    @Transactional
    public void editDictData(DictDataEditRequest request) {
        SysDictData data = dictDataMapper.selectById(request.getDictDataId());
        if (data == null) throw AppException.notFound("字典数据不存在");
        if (request.getDictLabel() != null) data.setDictLabel(request.getDictLabel());
        if (request.getDictValue() != null) data.setDictValue(request.getDictValue());
        if (request.getCssClass() != null) data.setCssClass(request.getCssClass());
        if (request.getListClass() != null) data.setListClass(request.getListClass());
        if (request.getSortNum() != null) data.setSortNum(request.getSortNum());
        if (request.getStatus() != null) data.setStatus(request.getStatus());
        if (request.getIsDefault() != null) data.setIsDefault(request.getIsDefault());
        dictDataMapper.updateById(data);
    }

    @Transactional
    public void removeDictData(List<String> ids) {
        for (String id : ids) {
            SysDictData data = dictDataMapper.selectById(id);
            if (data != null) {
                data.setDeleted(1);
                dictDataMapper.updateById(data);
            }
        }
    }
}
