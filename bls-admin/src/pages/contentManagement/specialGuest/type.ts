export type SpecialGuestRecord = {
  id: string | number;
  tenantId?: string | number;
  name: string;
  title?: string | null;
  sortNo?: number | null;
  avatar?: string | null;
  description?: string | null;
  status?: number | string;
  createdAt?: string;
  updatedAt?: string;
};
