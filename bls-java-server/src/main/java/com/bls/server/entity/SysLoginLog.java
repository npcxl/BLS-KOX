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
    private String loginType;
    private String loginStatus;
    private String failReason;
    private String loginIp;
    private String userAgent;
    private String requestId;
    private LocalDateTime loginTime;
}
