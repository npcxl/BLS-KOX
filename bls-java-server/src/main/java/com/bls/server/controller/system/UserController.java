package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.distributed.idempotent.Idempotent;
import com.bls.server.distributed.lock.DistributedLock;
import com.bls.server.distributed.ratelimit.RateLimit;
import com.bls.server.service.system.UserService;
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

@Tag(name = "用户管理", description = "系统用户增删改查")
@RestController
@RequestMapping("/api/system/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @Data
    public static class UserQueryRequest {
        private Integer pageNum = 1;
        private Integer pageSize = 10;
        private String keyword;
    }

    @Data
    public static class UserCreateRequest {
        @NotBlank(message = "用户名不能为空")
        private String username;
        @NotBlank(message = "密码不能为空")
        private String password;
        private String nickname;
        private String realName;
        private String gender;
        private String email;
        private String phone;
        private String deptId;
        private String status;
        private String remark;
        private List<String> roleIds;
    }

    @Data
    public static class UserEditRequest {
        @NotBlank(message = "用户ID不能为空")
        private String userId;
        private String nickname;
        private String realName;
        private String gender;
        private String email;
        private String phone;
        private String deptId;
        private String status;
        private String remark;
        private List<String> roleIds;
    }

    @Data
    public static class UserRemoveRequest {
        @NotEmpty(message = "用户ID列表不能为空")
        private List<String> ids;
    }

    @Data
    public static class ChangePasswordRequest {
        @NotBlank(message = "旧密码不能为空")
        private String oldPassword;
        @NotBlank(message = "新密码不能为空")
        private String newPassword;
    }

    @Data
    public static class KickRequest {
        @NotEmpty(message = "用户ID列表不能为空")
        private List<String> userIds;
    }

    @Operation(summary = "用户列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:user:list')")
    public ApiResponse<List<Map<String, Object>>> list(UserQueryRequest request) {
        return userService.listUsers(request);
    }

    @Operation(summary = "当前用户详情")
    @GetMapping("/profile")
    public ApiResponse<Map<String, Object>> profile() {
        return ApiResponse.success(userService.getCurrentUserProfile());
    }

    @Operation(summary = "修改个人资料")
    @PutMapping("/profile")
    public ApiResponse<Void> updateProfile(@RequestBody Map<String, Object> body) {
        userService.updateProfile(body);
        return ApiResponse.success(null);
    }

    @Operation(summary = "新增用户")
    @Idempotent(prefix = "user:add:")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:user:add')")
    public ApiResponse<Void> add(@Valid @RequestBody UserCreateRequest request) {
        userService.addUser(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑用户")
    @DistributedLock(key = "user:edit:#{#request.userId}", waitTime = 3, leaseTime = 10)
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:user:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody UserEditRequest request) {
        userService.editUser(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除用户")
    @DistributedLock(key = "user:remove", waitTime = 5, leaseTime = 15)
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:user:remove')")
    public ApiResponse<Void> remove(@Valid @RequestBody UserRemoveRequest request) {
        userService.removeUsers(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }

    @Operation(summary = "修改密码")
    @RateLimit(key = "user:changePwd", limit = 5, windowSeconds = 60)
    @PutMapping("/changePassword")
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        userService.changePassword(request.getOldPassword(), request.getNewPassword());
        return ApiResponse.success(null, "密码修改成功");
    }

    @Operation(summary = "查看用户活跃会话")
    @GetMapping("/sessions/{userId}")
    @PreAuthorize("hasAuthority('PERM_system:user:kick')")
    public ApiResponse<?> sessions(@PathVariable String userId) {
        return ApiResponse.success(userService.getUserSessions(userId));
    }

    @Operation(summary = "踢下线")
    @DistributedLock(key = "user:kick", waitTime = 3, leaseTime = 10)
    @PostMapping("/kick")
    @PreAuthorize("hasAuthority('PERM_system:user:kick')")
    public ApiResponse<Void> kick(@Valid @RequestBody KickRequest request) {
        userService.kickUsers(request.getUserIds());
        return ApiResponse.success(null, "操作成功");
    }
}
