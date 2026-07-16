package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.service.system.DictService;
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

@Tag(name = "字典管理")
@RestController
@RequestMapping("/api/system/dict")
@RequiredArgsConstructor
public class DictController {

    private final DictService dictService;

    // === Dict Type ===

    @Data
    public static class DictTypeQueryRequest {
        private Integer pageNum = 1;
        private Integer pageSize = 10;
        private String keyword;
    }

    @Data
    public static class DictTypeCreateRequest {
        @NotBlank private String dictName;
        @NotBlank private String dictType;
        private String status = "0";
        private String remark;
    }

    @Data
    public static class DictTypeEditRequest {
        @NotBlank private String dictTypeId;
        private String dictName;
        private String dictType;
        private String status;
        private String remark;
    }

    @Data
    public static class DictTypeRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    // === Dict Data ===

    @Data
    public static class DictDataQueryRequest {
        private String dictType;
        private String dictTypeId;
        private Integer pageNum = 1;
        private Integer pageSize = 10;
    }

    @Data
    public static class DictDataCreateRequest {
        @NotBlank private String dictType;
        @NotBlank private String dictLabel;
        @NotBlank private String dictValue;
        private String cssClass;
        private String listClass;
        private Integer sortNum = 0;
        private String status = "0";
        private String isDefault = "N";
    }

    @Data
    public static class DictDataEditRequest {
        @NotBlank private String dictDataId;
        private String dictLabel;
        private String dictValue;
        private String cssClass;
        private String listClass;
        private Integer sortNum;
        private String status;
        private String isDefault;
    }

    @Data
    public static class DictDataRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    // --- Dict Type endpoints ---

    @Operation(summary = "字典类型列表")
    @GetMapping("/type/list")
    @PreAuthorize("hasAuthority('PERM_system:dict:list')")
    public ApiResponse<List<Map<String, Object>>> typeList(DictTypeQueryRequest request) {
        return dictService.listDictTypes(request);
    }

    @Operation(summary = "新增字典类型")
    @PostMapping("/type/add")
    @PreAuthorize("hasAuthority('PERM_system:dict:add')")
    public ApiResponse<Void> typeAdd(@Valid @RequestBody DictTypeCreateRequest request) {
        dictService.addDictType(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑字典类型")
    @PutMapping("/type/edit")
    @PreAuthorize("hasAuthority('PERM_system:dict:edit')")
    public ApiResponse<Void> typeEdit(@Valid @RequestBody DictTypeEditRequest request) {
        dictService.editDictType(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除字典类型")
    @DeleteMapping("/type/remove")
    @PreAuthorize("hasAuthority('PERM_system:dict:remove')")
    public ApiResponse<Void> typeRemove(@Valid @RequestBody DictTypeRemoveRequest request) {
        dictService.removeDictTypes(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }

    // --- Dict Data endpoints ---

    @Operation(summary = "字典数据列表")
    @GetMapping("/data/list")
    @PreAuthorize("hasAuthority('PERM_system:dict:list')")
    public ApiResponse<List<Map<String, Object>>> dataList(DictDataQueryRequest request) {
        return dictService.listDictData(request);
    }

    @Operation(summary = "根据类型获取字典数据")
    @GetMapping("/data/type")
    public ApiResponse<List<Map<String, Object>>> dataByType(@RequestParam String dictType) {
        return ApiResponse.success(dictService.getDictDataByType(dictType));
    }

    @Operation(summary = "新增字典数据")
    @PostMapping("/data/add")
    @PreAuthorize("hasAuthority('PERM_system:dict:add')")
    public ApiResponse<Void> dataAdd(@Valid @RequestBody DictDataCreateRequest request) {
        dictService.addDictData(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑字典数据")
    @PutMapping("/data/edit")
    @PreAuthorize("hasAuthority('PERM_system:dict:edit')")
    public ApiResponse<Void> dataEdit(@Valid @RequestBody DictDataEditRequest request) {
        dictService.editDictData(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除字典数据")
    @DeleteMapping("/data/remove")
    @PreAuthorize("hasAuthority('PERM_system:dict:remove')")
    public ApiResponse<Void> dataRemove(@Valid @RequestBody DictDataRemoveRequest request) {
        dictService.removeDictData(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }
}
