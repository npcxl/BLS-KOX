import { MenuTreeItem } from '../types/current-user';

export function buildMenuTree(items: MenuTreeItem[]): MenuTreeItem[] {
  const map = new Map<number, MenuTreeItem>();
  const roots: MenuTreeItem[] = [];

  items.forEach((item) => map.set(item.menuId, { ...item, children: [] }));

  map.forEach((item) => {
    if (item.parentId === 0) {
      roots.push(item);
      return;
    }
    const parent = map.get(item.parentId);
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  });

  const prune = (nodes: MenuTreeItem[]): MenuTreeItem[] =>
    nodes
      .sort((a, b) => a.sortNum - b.sortNum)
      .map((node) => ({
        ...node,
        ...(node.children && node.children.length > 0 ? { children: prune(node.children) } : { children: undefined }),
      }));

  return prune(roots);
}
