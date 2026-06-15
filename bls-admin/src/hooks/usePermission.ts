import { useMemo } from 'react';
import { useModel } from '@umijs/max';

export type PermissionInput = string | string[] | undefined | null;

function normalizePermissions(value: PermissionInput): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export function usePermission(required?: PermissionInput, mode: 'any' | 'all' = 'any') {
  const { initialState } = useModel('@@initialState');
  const userPerms = initialState?.currentUser?.perms ?? [];
  const isAdmin = initialState?.currentUser?.isAdmin === '1';

  const requiredPerms = useMemo(() => normalizePermissions(required), [required]);

  const hasPermission = useMemo(() => {
    if (isAdmin) return true;
    if (!requiredPerms.length) return true;

    if (mode === 'all') {
      return requiredPerms.every((perm) => userPerms.includes(perm));
    }

    return requiredPerms.some((perm) => userPerms.includes(perm));
  }, [isAdmin, mode, requiredPerms, userPerms]);

  const can = (perm?: PermissionInput, nextMode: 'any' | 'all' = 'any') => {
    const perms = normalizePermissions(perm);
    if (isAdmin) return true;
    if (!perms.length) return true;
    return nextMode === 'all'
      ? perms.every((item) => userPerms.includes(item))
      : perms.some((item) => userPerms.includes(item));
  };

  return {
    isAdmin,
    userPerms,
    hasPermission,
    can,
  };
}
