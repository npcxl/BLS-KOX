import { MenuTreeItem } from "../types/current-user";

export function buildMenuTree(items: MenuTreeItem[]): MenuTreeItem[] {
  const map = new Map<string, MenuTreeItem>();
  const roots: MenuTreeItem[] = [];

  items.forEach((item) =>
    map.set(String(item.menuId), {
      ...item,
      children: [],
    }),
  );

  map.forEach((item) => {
    if (String(item.parentId) === "0") {
      roots.push(item);
      return;
    }

    const parent = map.get(String(item.parentId));

    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  });

  const prune = (nodes: MenuTreeItem[]): MenuTreeItem[] =>
    nodes
      .sort((a, b) => Number(a.sortNum ?? 0) - Number(b.sortNum ?? 0))
      .map((node) => ({
        ...node,
        children:
          node.children && node.children.length > 0
            ? prune(node.children)
            : undefined,
      }));

  return prune(roots);
}
