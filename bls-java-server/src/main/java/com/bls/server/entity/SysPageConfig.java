package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_page_config")
public class SysPageConfig {

    @TableId(value = "config_id", type = IdType.ASSIGN_ID)
    private String configId;

    private String tenantId;
    private String userId;
    private String pageCode;
    private String configValue;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
