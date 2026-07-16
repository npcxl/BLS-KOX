package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.service.system.DeptService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "部门管理")
@RestController
@RequestMapping("/api/system/dept")
@RequiredArgsConstructor
public class DeptController {

    private final DeptService deptService;

    @Data
    public static class DeptCreateRequest {
        private String parentId = "0";
        @NotBlank private String deptName;
        private Integer sortNum = 0;
        private String leader;
        private String phone;
        private String email;
        private String status = "0";
    }

    @Data
    public static class DeptEditRequest {
        @NotBlank private String deptId;
        private String parentId;
        private String deptName;
        private Integer sortNum;
        private String leader;
        private String phone;
        private String email;
        private String status;
    }

    @Data
    public static class DeptRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Operation(summary = "部门列表（树形含用户）")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:dept:list')")
    public ApiResponse<List<Map<String, Object>>> list() {
        return ApiResponse.success(deptService.getDeptTree());
    }

    @Operation(summary = "部门下的用户")
    @GetMapping("/{deptId}/users")
    public ApiResponse<List<Map<String, Object>>> users(@PathVariable String deptId) {
        return ApiResponse.success(deptService.getDeptUsers(deptId));
    }

    @Operation(summary = "新增部门")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:dept:add')")
    public ApiResponse<Void> add(@Valid @RequestBody DeptCreateRequest request) {
        deptService.addDept(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑部门")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:dept:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody DeptEditRequest request) {
        deptService.editDept(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除部门")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:dept:remove')")
    public ApiResponse<Void> remove(@Valid @RequestBody DeptRemoveRequest request) {
        deptService.removeDepts(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }
}
