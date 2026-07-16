package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_dept")
public class SysDept {

    @TableId(value = "dept_id", type = IdType.ASSIGN_ID)
    private String deptId;

    private String tenantId;
    private String parentId;
    private String ancestors;
    private String deptName;
    private Integer sortNum;
    private String leader;
    private String phone;
    private String email;
    private String status;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String createBy;
    private String updateBy;
    private String remark;
}
