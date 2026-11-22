import "server-only";

import {
  httpNotificationGateway,
  NotificationApiError,
  type NotificationHttpGateway,
} from "./http-notification-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function notificationApiFor(
  client?: SessionClient | null,
): Promise<NotificationHttpGateway | null> {
  if (process.env.NOTIFICATIONS_API_ENABLED !== "true") return null;
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl =
    process.env.NOTIFICATIONS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new NotificationApiError("API de notificações não configurada.");
  return httpNotificationGateway(backendUrl, accessToken);
}

