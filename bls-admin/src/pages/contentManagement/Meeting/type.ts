export type MeetingGuest = {
  name: string;
  title?: string | null;
  avatar?: string | null;
  description?: string | null;
  status?: number | null;
};

export type MeetingAgenda = {
  time?: string | null;
  title: string;
  content?: string | null;
};

export type MeetingRecord = {
  id: string | number;
  tenantId?: string | number;
  meetingName: string;
  locationAddress?: string | null;
  meetingTime?: string | null;
  subtitle?: string | null;
  coverImage?: string | null;
  content?: string | null;
  guests?: MeetingGuest[] | string | null;
  agenda?: MeetingAgenda[] | string | null;
  status?: number | string;
  createdAt?: string;
  updatedAt?: string;
};
