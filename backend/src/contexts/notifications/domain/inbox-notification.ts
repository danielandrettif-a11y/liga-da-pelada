export type InboxNotificationState = "active" | "resolved";

export type InboxNotificationRecord = {
  id: string;
  title: string;
  body: string;
  href: string;
  notification_type?: string;
  state: InboxNotificationState;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DesiredInboxNotification = {
  type: string;
  key: string;
  title: string;
  body: string;
  href: string;
};

export class InvalidNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationError";
  }
}

export function validateNotificationHref(href: string): string {
  if (!href || typeof href !== "string") {
    return "/";
  }
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `/${trimmed}`;
  }
  return trimmed;
}

export function validateDesiredNotification(input: DesiredInboxNotification): DesiredInboxNotification {
  if (!input.title || typeof input.title !== "string" || !input.title.trim()) {
    throw new InvalidNotificationError("Título da notificação é obrigatório.");
  }
  if (!input.body || typeof input.body !== "string" || !input.body.trim()) {
    throw new InvalidNotificationError("Corpo da notificação é obrigatório.");
  }
  if (!input.key || typeof input.key !== "string" || !input.key.trim()) {
    throw new InvalidNotificationError("Chave única de deduplicação é obrigatória.");
  }
  if (!input.type || typeof input.type !== "string" || !input.type.trim()) {
    throw new InvalidNotificationError("Tipo da notificação é obrigatório.");
  }
  return {
    title: input.title.trim(),
    body: input.body.trim(),
    key: input.key.trim(),
    type: input.type.trim(),
    href: validateNotificationHref(input.href),
  };
}

