package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_page_config")
public class SysPageConfig {

    @TableId(value = "page_config_id", type = IdType.ASSIGN_ID)
    private String pageConfigId;

    private String pageCode;
    private String pageName;
    private Integer enabled;
    private Integer sort;
    private String tenantId;
    private String remark;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
