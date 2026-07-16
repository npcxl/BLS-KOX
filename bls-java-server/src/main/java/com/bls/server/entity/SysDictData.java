package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_dict_data")
public class SysDictData {

    @TableId(value = "dict_data_id", type = IdType.ASSIGN_ID)
    private String dictDataId;

    private String dictTypeId;
    private String dictLabel;
    private String dictValue;
    private Integer dictSort;
    private String tag;
    private String status;
    private String remark;
    private String tenantId;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
