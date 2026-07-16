package com.bls.server.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.AppException;
import com.bls.server.controller.system.MenuController.*;
import com.bls.server.entity.SysMenu;
import com.bls.server.entity.SysRoleMenu;
import com.bls.server.mapper.SysMenuMapper;
import com.bls.server.mapper.SysRoleMenuMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MenuService {

    private final SysMenuMapper menuMapper;
    private final SysRoleMenuMapper roleMenuMapper;

    public List<Map<String, Object>> getMenuTree(String keyword) {
        LambdaQueryWrapper<SysMenu> wrapper = new LambdaQueryWrapper<SysMenu>()
                .eq(SysMenu::getDeleted, 0);

        if (keyword != null && !keyword.isBlank()) {
            wrapper.like(SysMenu::getMenuName, keyword);
        }

        wrapper.orderByAsc(SysMenu::getSortNum);
        List<SysMenu> menus = menuMapper.selectList(wrapper);

        return buildTree(menus, "0");
    }

    @Transactional
    public void addMenu(MenuCreateRequest request) {
        SysMenu menu = new SysMenu();
        menu.setParentId(request.getParentId());
        menu.setMenuName(request.getMenuName());
        menu.setMenuType(request.getMenuType());
        menu.setPath(request.getPath());
        menu.setComponent(request.getComponent());
        menu.setIcon(request.getIcon());
        menu.setPerms(request.getPerms());
        menu.setSortNum(request.getSortNum());
        menu.setStatus(request.getStatus());
        menu.setIsCache(request.getIsCache());
        menu.setIsFrame(request.getIsFrame());
        menu.setVisible(request.getVisible());
        menuMapper.insert(menu);
    }

    @Transactional
    public void editMenu(MenuEditRequest request) {
        SysMenu menu = menuMapper.selectById(request.getMenuId());
        if (menu == null) throw AppException.notFound("菜单不存在");

        if (request.getParentId() != null) menu.setParentId(request.getParentId());
        if (request.getMenuName() != null) menu.setMenuName(request.getMenuName());
        if (request.getMenuType() != null) menu.setMenuType(request.getMenuType());
        if (request.getPath() != null) menu.setPath(request.getPath());
        if (request.getComponent() != null) menu.setComponent(request.getComponent());
        if (request.getIcon() != null) menu.setIcon(request.getIcon());
        if (request.getPerms() != null) menu.setPerms(request.getPerms());
        if (request.getSortNum() != null) menu.setSortNum(request.getSortNum());
        if (request.getStatus() != null) menu.setStatus(request.getStatus());
        if (request.getIsCache() != null) menu.setIsCache(request.getIsCache());
        if (request.getIsFrame() != null) menu.setIsFrame(request.getIsFrame());
        if (request.getVisible() != null) menu.setVisible(request.getVisible());

        menuMapper.updateById(menu);
    }

    @Transactional
    public void removeMenus(List<String> ids) {
        for (String menuId : ids) {
            // Physical delete for menus (aligned with Koa)
            menuMapper.deleteById(menuId);
            roleMenuMapper.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getMenuId, menuId));
        }
    }

    private List<Map<String, Object>> buildTree(List<SysMenu> menus, String parentId) {
        List<Map<String, Object>> tree = new ArrayList<>();
        for (SysMenu menu : menus) {
            if (Objects.equals(parentId, menu.getParentId())) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("menuId", menu.getMenuId());
                node.put("parentId", menu.getParentId());
                node.put("menuName", menu.getMenuName());
                node.put("menuType", menu.getMenuType());
                node.put("path", menu.getPath());
                node.put("component", menu.getComponent());
                node.put("icon", menu.getIcon());
                node.put("perms", menu.getPerms());
                node.put("sortNum", menu.getSortNum());
                node.put("status", menu.getStatus());
                node.put("isCache", menu.getIsCache());
                node.put("isFrame", menu.getIsFrame());
                node.put("visible", menu.getVisible());
                node.put("createTime", menu.getCreateTime());

                List<Map<String, Object>> children = buildTree(menus, menu.getMenuId());
                if (!children.isEmpty()) {
                    node.put("children", children);
                }
                tree.add(node);
            }
        }
        return tree;
    }
}
