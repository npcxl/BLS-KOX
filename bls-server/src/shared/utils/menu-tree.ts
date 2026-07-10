import { MenuTreeItem } from "../types/current-user";

export function buildMenuTree(items: any[]): MenuTreeItem[] {
  // 兼容 snake_case 和 camelCase
  const items_: MenuTreeItem[] = items.map((r: any) => ({
    menuId: String(r.menuId ?? r.menu_id ?? ""),
    parentId: String(r.parentId ?? r.parent_id ?? "0"),
    menuName: r.menuName ?? r.menu_name ?? "",
    path: r.path ?? null,
    component: r.component ?? null,
    perms: r.perms ?? null,
    icon: r.icon ?? null,
    menuType: r.menuType ?? r.menu_type ?? "1",
    sortNum: r.sortNum ?? r.sort_num ?? 0,
    status: r.status ?? "0",
  }));

  const map = new Map<string, MenuTreeItem>();
  const roots: MenuTreeItem[] = [];

  items_.forEach((item) =>
    map.set(item.menuId, { ...item, children: [] }),
  );

  map.forEach((item) => {
    if (item.parentId === "0") { roots.push(item); return; }
    const parent = map.get(item.parentId);
    if (parent) { parent.children = parent.children ?? []; parent.children.push(item); }
    else { roots.push(item); }
  });

  const prune = (nodes: MenuTreeItem[]): MenuTreeItem[] =>
    nodes
      .sort((a, b) => Number(a.sortNum ?? 0) - Number(b.sortNum ?? 0))
      .map((node) => ({
        ...node,
        children: node.children && node.children.length > 0 ? prune(node.children) : undefined,
      }));

  return prune(roots);
}
