package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.core.BaseCrudController;
import com.bls.server.entity.SysConfig;
import com.bls.server.security.TenantContext;
import com.bls.server.service.system.ConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Tag(name = "参数配置")
@RestController
@RequestMapping("/api/system/config")
public class ConfigController extends BaseCrudController<SysConfig, ConfigController.ConfigCreateRequest, ConfigController.ConfigEditRequest> {

    private final ConfigService configService;

    public ConfigController(ConfigService svc) {
        super(svc);
        this.configService = svc;
    }

    @Override protected String getPermPrefix() { return "system:config"; }

    @Override @GetMapping("/list") @PreAuthorize("hasAuthority('PERM_system:config:list')")
    public ApiResponse<java.util.List<Map<String, Object>>> list(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize, @RequestParam(required = false) String keyword) { return super.list(pageNum, pageSize, keyword); }
    @Override @PostMapping("/add") @PreAuthorize("hasAuthority('PERM_system:config:add')")
    public ApiResponse<Void> add(@jakarta.validation.Valid @RequestBody ConfigCreateRequest r) { return super.add(r); }
    @Override @PutMapping("/edit") @PreAuthorize("hasAuthority('PERM_system:config:edit')")
    public ApiResponse<Void> edit(@jakarta.validation.Valid @RequestBody ConfigEditRequest r) { return super.edit(r); }
    @Override @DeleteMapping("/remove") @PreAuthorize("hasAuthority('PERM_system:config:remove')")
    public ApiResponse<Void> remove(@RequestBody List<String> ids) { return super.remove(ids); }

    @Data
    public static class ConfigCreateRequest {
        @NotBlank private String configName;
        @NotBlank private String configKey;
        @NotBlank private String configValue;
        private String configType = "Y";
        private String status = "0";
        private String remark;
    }

    @Data
    public static class ConfigEditRequest {
        @NotBlank private String configId;
        private String configName;
        private String configKey;
        private String configValue;
        private String configType;
        private String status;
        private String remark;
    }

    // ========== 自定义端点（非基类提供） ==========

    @Operation(summary = "公开获取主题配置（无需登录）")
    @GetMapping("/public-theme")
    public ApiResponse<Map<String, Object>> publicTheme() {
        SysConfig c = configService.getPublicConfig("theme.default");
        if (c == null) return ApiResponse.success(null);
        return ApiResponse.success(Map.of("configId", c.getConfigId(), "configKey", c.getConfigKey(), "configValue", c.getConfigValue()));
    }

    @Operation(summary = "公开获取系统配置（无需登录）")
    @GetMapping("/public-system")
    public ApiResponse<List<Map<String, Object>>> publicSystem() {
        List<String> keys = List.of("sys.app.name","sys.demo.enabled","sys.upload.maxSize","sys.version","sys.app.logo","sys.user.defaultAvatar","sys.user.defaultPassword");
        List<Map<String, Object>> result = new ArrayList<>();
        for (String k : keys) {
            SysConfig c = configService.getPublicConfig(k);
            if (c != null) result.add(Map.of("configId",c.getConfigId(),"configKey",c.getConfigKey(),"configValue",c.getConfigValue()));
        }
        return ApiResponse.success(result);
    }

    @Operation(summary = "当前租户系统配置（Koa兼容）")
    @GetMapping("/current")
    public ApiResponse<List<Map<String, Object>>> current() { return publicSystem(); }

    @Operation(summary = "根据Key获取配置")
    @GetMapping("/key/{configKey}")
    public ApiResponse<Map<String, Object>> getByKey(@PathVariable String configKey) {
        String tid = TenantContext.getTenantId();
        SysConfig c = configService.getByKey(tid != null ? tid : "000000", configKey);
        if (c == null) return ApiResponse.success(null);
        return ApiResponse.success(Map.of("configId",c.getConfigId(),"configKey",c.getConfigKey(),"configValue",c.getConfigValue()));
    }
}
