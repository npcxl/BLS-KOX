package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_global_search_config")
public class SysGlobalSearchConfig {

    @TableId(value = "search_id", type = IdType.ASSIGN_ID)
    private String searchId;

    private String moduleKey;
    private String moduleName;
    private String permission;
    private String routePath;
    private String sourceTable;
    private String bizIdField;
    private String titleField;
    private String subtitleField;
    private String contentFields;
    private String tenantField;
    private String ownerField;
    private String deptField;
    private String createdByField;
    private String statusField;
    private String deletedField;
    private Integer enabled;
    private Integer sort;
    private String remark;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
