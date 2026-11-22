import type {
  DesiredInboxNotification,
  InboxNotification,
  InboxPreview,
} from "../domain/inbox";
import type {
  NotificationPreferences,
  SerializedPushSubscription,
  UpdateNotificationPreferencesInput,
} from "../domain/preferences";

export class NotificationApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "NotificationApiError";
  }
}

export interface NotificationGateway {
  getInboxPreview(): Promise<InboxPreview>;
  markInboxRead(ids?: string[]): Promise<{ success: boolean }>;
  syncAndListInbox(
    leagueId: string,
    desired: DesiredInboxNotification[],
  ): Promise<InboxNotification[]>;
  getPushPublicKey(): Promise<{
    success: boolean;
    publicKey: string;
    backgroundAlertsConfigured: boolean;
    error?: string;
  }>;
  getPushSystemStatus(): Promise<{
    pushConfigured: boolean;
    pushConfigurationError: string | null;
    backgroundAlertsConfigured: boolean;
  }>;
  subscribeToPush(
    subscription: SerializedPushSubscription,
  ): Promise<{ success: boolean; error?: string }>;
  unsubscribeFromPush(
    endpoint: string,
  ): Promise<{ success: boolean; error?: string }>;
  getNotificationPreferences(
    leagueId: string,
  ): Promise<NotificationPreferences | null>;
  updateNotificationPreferences(
    input: UpdateNotificationPreferencesInput,
  ): Promise<{ success: boolean; error?: string }>;
  sendPushTest(): Promise<{
    success: boolean;
    scheduled?: boolean;
    error?: string;
  }>;
  sendCartolaEmailTest(input: {
    leagueId: string;
  }): Promise<{ success: boolean; testedAt?: string; error?: string }>;
  deliverPushTestAlert(
    userId: string,
    webhookSecret: string,
  ): Promise<{ success?: boolean; sent?: number; error?: string }>;
  setCartolaRemindersEnabled(
    leagueId: string,
    enabled: boolean,
  ): Promise<{ success: boolean; error?: string }>;
  cancelCartolaEmailReminders(
    userId: string,
    token: string,
  ): Promise<{ success: boolean; error?: string }>;
  relayOrDispatchCartolaReminder(
    job: unknown,
    webhookSecret: string,
  ): Promise<{ success?: boolean; sent?: number; relayed?: boolean; skipped?: string; error?: string }>;
  dispatchMatchTimerAlert(
    matchId: string,
    threshold: string,
    webhookSecret: string,
  ): Promise<{ success?: boolean; skipped?: boolean; reason?: string; secondsLeft?: number; error?: string }>;
}

export type NotificationHttpGateway = NotificationGateway;

export function httpNotificationGateway(
  baseUrlOrOptions: string | { baseUrl: string; accessToken?: string },
  maybeToken?: string,
): NotificationGateway {
  const options =
    typeof baseUrlOrOptions === "string"
      ? { baseUrl: baseUrlOrOptions, accessToken: maybeToken }
      : baseUrlOrOptions;

  const normalizedBase = options.baseUrl.replace(/\/+$/, "");

  function authHeaders(withJson = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (options.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }
    if (withJson) {
      headers["content-type"] = "application/json";
    }
    return headers;
  }

  async function requestJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${normalizedBase}${path}`;
    const response = await fetch(url, init);
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `HTTP ${response.status}`;
      throw new NotificationApiError(message, response.status);
    }

    return body as T;
  }

  return {
    async getInboxPreview(): Promise<InboxPreview> {
      return requestJson<InboxPreview>("/api/notifications/inbox/preview", {
        headers: authHeaders(),
        cache: "no-store",
      });
    },

    async markInboxRead(ids?: string[]): Promise<{ success: boolean }> {
      return requestJson<{ success: boolean }>("/api/notifications/inbox/read", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ ids }),
      });
    },

    async syncAndListInbox(
      leagueId: string,
      desired: DesiredInboxNotification[],
    ): Promise<InboxNotification[]> {
      return requestJson<InboxNotification[]>("/api/notifications/inbox/sync", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ leagueId, desired }),
      });
    },

    async getPushPublicKey() {
      return requestJson<{
        success: boolean;
        publicKey: string;
        backgroundAlertsConfigured: boolean;
        error?: string;
      }>("/api/notifications/push/public-key", {
        headers: authHeaders(),
        cache: "no-store",
      });
    },

    async getPushSystemStatus() {
      return requestJson<{
        pushConfigured: boolean;
        pushConfigurationError: string | null;
        backgroundAlertsConfigured: boolean;
      }>("/api/notifications/push/status", {
        headers: authHeaders(),
        cache: "no-store",
      });
    },

    async subscribeToPush(subscription: SerializedPushSubscription) {
      return requestJson<{ success: boolean; error?: string }>(
        "/api/notifications/push/subscribe",
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(subscription),
        },
      );
    },

    async unsubscribeFromPush(endpoint: string) {
      return requestJson<{ success: boolean; error?: string }>(
        "/api/notifications/push/unsubscribe",
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ endpoint }),
        },
      );
    },

    async getNotificationPreferences(leagueId: string) {
      return requestJson<NotificationPreferences | null>(
        `/api/notifications/preferences/${encodeURIComponent(leagueId)}`,
        {
          headers: authHeaders(),
          cache: "no-store",
        },
      );
    },

    async updateNotificationPreferences(input: UpdateNotificationPreferencesInput) {
      return requestJson<{ success: boolean; error?: string }>(
        "/api/notifications/preferences",
        {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify(input),
        },
      );
    },

    async sendPushTest(): Promise<{ success: boolean; scheduled?: boolean; error?: string }> {
      return requestJson<{ success: boolean; scheduled?: boolean; error?: string }>(
        "/api/notifications/test-push",
        {
          method: "POST",
          headers: authHeaders(true),
        },
      );
    },

    async sendCartolaEmailTest(input: {
      leagueId: string;
      email?: string;
      name?: string;
    }): Promise<{ success: boolean; testedAt?: string; error?: string }> {
      return requestJson<{ success: boolean; testedAt?: string; error?: string }>(
        "/api/notifications/test-cartola-email",
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(input),
        },
      );
    },

    async deliverPushTestAlert(
      userId: string,
      webhookSecret: string,
    ): Promise<{ success?: boolean; sent?: number; error?: string }> {
      return requestJson<{ success?: boolean; sent?: number; error?: string }>(
        "/api/internal/notifications/push-test-alert",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({ userId }),
        },
      );
    },

    async setCartolaRemindersEnabled(leagueId: string, enabled: boolean) {
      return requestJson<{ success: boolean; error?: string }>(
        "/api/notifications/cartola/reminders/toggle",
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ leagueId, enabled }),
        },
      );
    },

    async cancelCartolaEmailReminders(userId: string, token: string) {
      return requestJson<{ success: boolean; error?: string }>(
        "/api/notifications/cartola/reminders/cancel",
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ userId, token }),
        },
      );
    },

    async relayOrDispatchCartolaReminder(job: unknown, webhookSecret: string) {
      return requestJson<{ success?: boolean; sent?: number; relayed?: boolean; skipped?: string; error?: string }>(
        "/api/internal/notifications/cartola-reminder",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify(job),
        },
      );
    },

    async dispatchMatchTimerAlert(matchId: string, threshold: string, webhookSecret: string) {
      return requestJson<{ success?: boolean; skipped?: boolean; reason?: string; secondsLeft?: number; error?: string }>(
        "/api/internal/notifications/match-timer-alert",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({ matchId, threshold }),
        },
      );
    },
  };
}
