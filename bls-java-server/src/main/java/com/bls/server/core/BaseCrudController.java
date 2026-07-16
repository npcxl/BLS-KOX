package com.bls.server.core;

import com.bls.server.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 通用 CRUD Controller 基类 — 对齐 Koa defineCrudModule() 自动路由。
 * <p>
 * 子类声明路径前缀和权限前缀，并在方法上自行标注 @PreAuthorize。
 * 注意：@PreAuthorize 的 SpEL 不支持动态方法调用，所以不能在基类统一标注。
 * 子类需要自己重写 list/add/edit/remove 并标注权限。
 */
public abstract class BaseCrudController<T, C, E> {

    protected final BaseCrudService<T, ?, C, E> service;

    public BaseCrudController(BaseCrudService<T, ?, C, E> service) {
        this.service = service;
    }

    /** 权限前缀，如 "system:user" */
    protected abstract String getPermPrefix();

    // 子类必须自己实现并加 @PreAuthorize，因为 SpEL 无法调用 getPermPrefix()

    @GetMapping("/list")
    public ApiResponse<List<Map<String, Object>>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String keyword) {
        return service.list(pageNum, pageSize, keyword);
    }

    @PostMapping("/add")
    public ApiResponse<Void> add(@Valid @RequestBody C request) {
        service.add(request);
        return ApiResponse.success(null, "新增成功");
    }

    @PutMapping("/edit")
    public ApiResponse<Void> edit(@Valid @RequestBody E request) {
        service.edit(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @DeleteMapping("/remove")
    public ApiResponse<Void> remove(@RequestBody List<String> ids) {
        service.remove(ids);
        return ApiResponse.success(null, "删除成功");
    }
}
