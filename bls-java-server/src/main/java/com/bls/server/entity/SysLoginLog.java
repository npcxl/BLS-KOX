package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_login_log")
public class SysLoginLog {

    @TableId(value = "log_id", type = IdType.ASSIGN_ID)
    private String logId;

    private String tenantId;
    private String userId;
    private String username;
    private String loginIp;
    private String loginLocation;
    private String browser;
    private String os;
    private String status;
    private String msg;
    private LocalDateTime loginTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
