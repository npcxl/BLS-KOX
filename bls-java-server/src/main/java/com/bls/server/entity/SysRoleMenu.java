package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_role_menu")
public class SysRoleMenu {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String roleId;
    private String menuId;
}
