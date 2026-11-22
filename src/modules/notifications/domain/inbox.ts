export type InboxNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  notification_type?: string;
  state: "active" | "resolved";
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InboxPreview = InboxNotification[];

export type DesiredInboxNotification = {
  type: string;
  key: string;
  title: string;
  body: string;
  href: string;
};
