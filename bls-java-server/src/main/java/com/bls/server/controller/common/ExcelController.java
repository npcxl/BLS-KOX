package com.bls.server.controller.common;

import cn.hutool.core.util.StrUtil;
import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.context.AnalysisContext;
import com.alibaba.excel.event.AnalysisEventListener;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.*;
import com.bls.server.mapper.*;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Tag(name = "Excel导入导出")
@RestController
@RequestMapping("/api/common/excel")
@RequiredArgsConstructor
public class ExcelController {

    private final SysUserMapper userMapper;
    private final SysRoleMapper roleMapper;
    private final SysDeptMapper deptMapper;
    private final SysConfigMapper configMapper;
    private final SysDictDataMapper dictDataMapper;

    @Data
    public static class ExportRequest {
        private String metaKey;
        private List<String> columns;
        private String keyword;
    }

    @Operation(summary = "导出Excel")
    @PostMapping("/export")
    public void exportData(@RequestBody ExportRequest request, HttpServletResponse response) throws IOException {
        String tenantId = TenantContext.getTenantId();

        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding("utf-8");
        String fileName = URLEncoder.encode("export_" + request.getMetaKey() + ".xlsx",
                StandardCharsets.UTF_8).replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition", "attachment;filename=" + fileName);

        List<Map<String, Object>> data = switch (request.getMetaKey()) {
            case "system-user" -> exportUsers(tenantId, request);
            case "system-role" -> exportRoles(tenantId, request);
            case "system-config" -> exportConfigs(tenantId, request);
            default -> Collections.emptyList();
        };

        // Write to Excel using EasyExcel
        if (!data.isEmpty()) {
            List<List<String>> head = request.getColumns() != null
                    ? request.getColumns().stream().map(List::of).collect(Collectors.toList())
                    : new ArrayList<>(data.get(0).keySet()).stream().map(List::of).collect(Collectors.toList());

            List<List<Object>> rows = data.stream()
                    .map(row -> row.values().stream()
                            .map(v -> v != null ? v : "")
                            .collect(Collectors.toList()))
                    .collect(Collectors.toList());

            EasyExcel.write(response.getOutputStream())
                    .head(head)
                    .sheet("Sheet1")
                    .doWrite(rows);
        }
    }

    @Operation(summary = "下载导入模板")
    @GetMapping("/template")
    public void downloadTemplate(@RequestParam String metaKey, HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding("utf-8");
        String fileName = URLEncoder.encode("template_" + metaKey + ".xlsx",
                StandardCharsets.UTF_8).replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition", "attachment;filename=" + fileName);

        List<List<String>> head = switch (metaKey) {
            case "system-user" -> List.of(
                    List.of("用户名*"), List.of("昵称"), List.of("密码*"),
                    List.of("性别"), List.of("邮箱"), List.of("手机号"), List.of("部门"));
            case "system-role" -> List.of(
                    List.of("角色名称*"), List.of("角色标识*"), List.of("数据权限"), List.of("备注"));
            case "system-config" -> List.of(
                    List.of("配置名称*"), List.of("配置键*"), List.of("配置值*"), List.of("备注"));
            default -> List.of();
        };

        EasyExcel.write(response.getOutputStream())
                .head(head)
                .sheet("Sheet1")
                .doWrite(Collections.emptyList());
    }

    @Operation(summary = "导入Excel")
    @PostMapping("/import")
    public ApiResponse<Map<String, Object>> importData(@RequestParam("file") MultipartFile file,
                                                        @RequestParam String metaKey) {
        String tenantId = TenantContext.getTenantId();
        List<Map<String, String>> errors = new ArrayList<>();
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);

        try {
            EasyExcel.read(file.getInputStream(), new AnalysisEventListener<Map<Integer, String>>() {
                private int rowIndex = 0;

                @Override
                public void invoke(Map<Integer, String> rowData, AnalysisContext context) {
                    rowIndex++;
                    if (rowIndex == 1) return; // skip header

                    try {
                        Map<String, String> row = new LinkedHashMap<>();
                        rowData.forEach((k, v) -> row.put(String.valueOf(k), v));
                        importRow(metaKey, tenantId, row);
                        successCount.incrementAndGet();
                    } catch (Exception e) {
                        Map<String, String> err = new LinkedHashMap<>();
                        err.put("rowNumber", String.valueOf(rowIndex));
                        err.put("message", e.getMessage());
                        errors.add(err);
                        failCount.incrementAndGet();
                    }
                }

                @Override
                public void doAfterAllAnalysed(AnalysisContext context) {}
            }).sheet().doRead();

        } catch (IOException e) {
            throw AppException.badRequest("文件读取失败");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("successCount", successCount.get());
        result.put("failCount", failCount.get());
        result.put("errors", errors);
        return ApiResponse.success(result);
    }

    private void importRow(String metaKey, String tenantId, Map<String, String> row) {
        switch (metaKey) {
            case "system-user" -> {
                String username = row.get("0");
                if (StrUtil.isBlank(username)) throw new RuntimeException("用户名不能为空");
                SysUser user = new SysUser();
                user.setTenantId(tenantId);
                user.setUsername(username);
                user.setNickname(row.getOrDefault("1", username));
                user.setPassword(row.getOrDefault("2", "123456"));
                user.setGender(row.getOrDefault("3", "0"));
                user.setEmail(row.get("4"));
                user.setPhone(row.get("5"));
                userMapper.insert(user);
            }
            case "system-role" -> {
                String roleName = row.get("0");
                String roleKey = row.get("1");
                if (StrUtil.isBlank(roleName)) throw new RuntimeException("角色名称不能为空");
                if (StrUtil.isBlank(roleKey)) throw new RuntimeException("角色标识不能为空");
                SysRole role = new SysRole();
                role.setTenantId(tenantId);
                role.setRoleName(roleName);
                role.setRoleKey(roleKey);
                role.setDataScope(row.getOrDefault("2", "SELF"));
                role.setRemark(row.get("3"));
                roleMapper.insert(role);
            }
            case "system-config" -> {
                SysConfig config = new SysConfig();
                config.setTenantId(tenantId);
                config.setConfigName(row.get("0"));
                config.setConfigKey(row.get("1"));
                config.setConfigValue(row.get("2"));
                config.setRemark(row.get("3"));
                configMapper.insert(config);
            }
        }
    }

    private List<Map<String, Object>> exportUsers(String tenantId, ExportRequest request) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getDeleted, 0);
        if (request.getKeyword() != null) {
            wrapper.like(SysUser::getUsername, request.getKeyword());
        }
        return userMapper.selectList(wrapper).stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("username", u.getUsername());
            m.put("nickname", u.getNickname());
            m.put("gender", u.getGender());
            m.put("email", u.getEmail());
            m.put("phone", u.getPhone());
            m.put("status", u.getStatus());
            return m;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> exportRoles(String tenantId, ExportRequest request) {
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getTenantId, tenantId)
                .eq(SysRole::getDeleted, 0);
        return roleMapper.selectList(wrapper).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roleName", r.getRoleName());
            m.put("roleKey", r.getRoleKey());
            m.put("dataScope", r.getDataScope());
            m.put("status", r.getStatus());
            return m;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> exportConfigs(String tenantId, ExportRequest request) {
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getTenantId, tenantId)
                .eq(SysConfig::getDeleted, 0);
        return configMapper.selectList(wrapper).stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("configName", c.getConfigName());
            m.put("configKey", c.getConfigKey());
            m.put("configValue", c.getConfigValue());
            return m;
        }).collect(Collectors.toList());
    }
}
