package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_user")
public class SysUser {

    @TableId(value = "user_id", type = IdType.ASSIGN_ID)
    private String userId;

    private String tenantId;
    private String username;
    private String password;
    private String passwordAlgorithm;
    private String nickname;
    private String realName;
    private String avatar;
    private String gender;
    private String email;
    private String phone;
    private String deptId;
    private String isAdmin;
    private String status;
    private String lastLoginIp;
    private LocalDateTime lastLoginTime;
    private LocalDateTime passwordUpdateTime;
    private String remark;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String createBy;
    private String updateBy;
}
