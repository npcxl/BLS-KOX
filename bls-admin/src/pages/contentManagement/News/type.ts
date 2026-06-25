export type NewsRecord = {
  id: string | number;
  title: string;
  subtitle?: string | null;
  coverImage?: string | null;
  publishDate?: string | null;
  content?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
