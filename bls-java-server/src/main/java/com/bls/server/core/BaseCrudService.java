package com.bls.server.core;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import org.springframework.transaction.annotation.Transactional;

import java.io.Serializable;
import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * 通用 CRUD Service 基类 — 对齐 Koa defineCrudModule() 设计。
 * 子类通过构造函数传入 entityFactory 避免反射推断实体类型。
 */
public abstract class BaseCrudService<T, M extends BaseMapper<T>, C, E> {

    protected final M mapper;
    protected final Supplier<T> entityFactory;

    public BaseCrudService(M mapper, Supplier<T> entityFactory) {
        this.mapper = mapper;
        this.entityFactory = entityFactory;
    }

    /** 分页列表查询 */
    public abstract ApiResponse<List<Map<String, Object>>> list(int pageNum, int pageSize, String keyword);

    /** 实体 → 前端 Map */
    protected abstract Map<String, Object> toMap(T entity);

    /** 新增时填充实体字段 */
    protected abstract void assignCreate(T entity, C request);

    /** 编辑时填充实体字段 */
    protected abstract void assignEdit(T entity, E request);

    /** 从 request 中提取 ID */
    protected abstract Serializable extractId(E request);

    // ==================== 标准 CRUD ====================

    @Transactional
    public void add(C request) {
        T entity = newEntity();
        assignCreate(entity, request);
        mapper.insert(entity);
    }

    @Transactional
    public void edit(E request) {
        T entity = mapper.selectById(extractId(request));
        if (entity == null) return;
        assignEdit(entity, request);
        mapper.updateById(entity);
    }

    @Transactional
    public void remove(List<String> ids) {
        mapper.deleteByIds(ids);
    }

    /** 通过 entityFactory 创建新实例，子类也可 override */
    protected T newEntity() {
        return entityFactory.get();
    }

    /** 快捷分页 + 搜索辅助方法 */
    protected ApiResponse<List<Map<String, Object>>> doList(
            int pageNum, int pageSize, String keyword,
            java.util.function.Consumer<LambdaQueryWrapper<T>> searchBuilder) {
        Page<T> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<T> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isBlank() && searchBuilder != null) {
            searchBuilder.accept(wrapper);
        }
        IPage<T> result = mapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream()
                .map(this::toMap).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }
}
