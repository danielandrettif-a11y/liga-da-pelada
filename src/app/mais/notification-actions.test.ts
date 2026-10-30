import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  activeLeague: vi.fn(),
  revalidatePath: vi.fn(),
  notificationApi: vi.fn(),
  getWebPushConfig: vi.fn(),
  schedulePushTestAlert: vi.fn(),
  sendCartolaReminderTest: vi.fn(),
  serviceClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  getCurrentAccount: mocks.account,
}));
vi.mock("@/lib/actions/rounds", () => ({
  getActiveLeague: mocks.activeLeague,
}));
vi.mock("@/modules/notifications/infrastructure/notification-api-session", () => ({
  notificationApiFor: mocks.notificationApi,
}));
vi.mock("@/lib/push-notifications", () => ({
  getWebPushConfiguration: mocks.getWebPushConfig,
}));
vi.mock("@/lib/match-timer-scheduler", () => ({
  schedulePushTestAlert: mocks.schedulePushTestAlert,
}));
vi.mock("@/lib/cartola-reminders", () => ({
  sendCartolaReminderTest: mocks.sendCartolaReminderTest,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.serviceClient,
}));

import {
  getNotificationPreferences,
  getPushPublicKey,
  getPushSystemStatus,
  sendCartolaEmailTest,
  sendPushTest,
  setCartolaRemindersEnabled,
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPreferences,
} from "./notification-actions";

const leagueId = "00000000-0000-4000-8000-000000000001";

describe("notification-actions via API gateway and legacy fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.getWebPushConfig.mockReturnValue({
      publicKey: "legacy-vapid-key",
      configured: true,
      error: null,
    });

    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "user_notification_preferences") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    match_push_enabled: true,
                    callup_push_enabled: true,
                    cartola_push_enabled: true,
                    cartola_email_enabled: true,
                    collective_push_enabled: true,
                  },
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "leagues") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    cartola_reminders_enabled: true,
                    cartola_email_tested_at: null,
                  },
                }),
              }),
            }),
          };
        }
        if (table === "push_subscriptions") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    mocks.account.mockResolvedValue({
      user: { id: "user-123", email: "user@exemplo.com", user_metadata: { name: "Usuario Teste" } },
      isAdmin: true,
      client,
    });
    mocks.activeLeague.mockResolvedValue({ id: leagueId });
    mocks.serviceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
  });

  it("routes getPushPublicKey via API when available", async () => {
    mocks.notificationApi.mockResolvedValue({
      getPushPublicKey: vi.fn().mockResolvedValue({
        success: true,
        publicKey: "api-vapid-key",
        backgroundAlertsConfigured: true,
      }),
    });

    const result = await getPushPublicKey();
    expect(result.success).toBe(true);
    expect(result.publicKey).toBe("api-vapid-key");
    expect(result.backgroundAlertsConfigured).toBe(true);
  });

  it("routes getPushSystemStatus via API when available", async () => {
    mocks.notificationApi.mockResolvedValue({
      getPushSystemStatus: vi.fn().mockResolvedValue({
        pushConfigured: true,
        pushConfigurationError: null,
        backgroundAlertsConfigured: true,
      }),
    });

    const result = await getPushSystemStatus();
    expect(result.pushConfigured).toBe(true);
    expect(result.backgroundAlertsConfigured).toBe(true);
  });

  it("routes subscribeToPush via API when available", async () => {
    const subscribeApi = vi.fn().mockResolvedValue({ success: true });
    mocks.notificationApi.mockResolvedValue({ subscribeToPush: subscribeApi });

    const subscription = {
      endpoint: "https://push.services.mozilla.com/test",
      expirationTime: null,
      keys: { p256dh: "p256", auth: "auth" },
    };

    const result = await subscribeToPush(subscription);
    expect(result).toEqual({ success: true });
    expect(subscribeApi).toHaveBeenCalledWith(subscription);
  });

  it("routes unsubscribeFromPush via API when available", async () => {
    const unsubscribeApi = vi.fn().mockResolvedValue({ success: true });
    mocks.notificationApi.mockResolvedValue({ unsubscribeFromPush: unsubscribeApi });

    const result = await unsubscribeFromPush("https://push.services.mozilla.com/test");
    expect(result).toEqual({ success: true });
    expect(unsubscribeApi).toHaveBeenCalledWith("https://push.services.mozilla.com/test");
  });

  it("routes getNotificationPreferences via API when available", async () => {
    const getPreferencesApi = vi.fn().mockResolvedValue({
      matchPushEnabled: true,
      callupPushEnabled: true,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: true,
      collectivePushEnabled: true,
      collectiveEnabled: true,
      emailTestedAt: null,
      emailConfigured: true,
    });
    mocks.notificationApi.mockResolvedValue({ getNotificationPreferences: getPreferencesApi });

    const result = await getNotificationPreferences();
    expect(result?.matchPushEnabled).toBe(true);
    expect(getPreferencesApi).toHaveBeenCalledWith(leagueId);
  });

  it("routes updateNotificationPreferences via API when available and revalidates path", async () => {
    const updatePreferencesApi = vi.fn().mockResolvedValue({ success: true });
    mocks.notificationApi.mockResolvedValue({ updateNotificationPreferences: updatePreferencesApi });

    const input = {
      matchPushEnabled: false,
      callupPushEnabled: true,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: true,
      collectivePushEnabled: true,
    };

    const result = await updateNotificationPreferences(input);
    expect(result).toEqual({ success: true });
    expect(updatePreferencesApi).toHaveBeenCalledWith(input);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mais/notificacoes");
  });

  it("routes sendPushTest via API when available", async () => {
    const sendPushTestApi = vi.fn().mockResolvedValue({ success: true, scheduled: true });
    mocks.notificationApi.mockResolvedValue({ sendPushTest: sendPushTestApi });

    const result = await sendPushTest();
    expect(result).toEqual({ success: true, scheduled: true });
    expect(sendPushTestApi).toHaveBeenCalled();
  });

  it("routes sendPushTest via legacy scheduler when API is disabled", async () => {
    mocks.notificationApi.mockResolvedValue(null);
    mocks.schedulePushTestAlert.mockResolvedValue({ scheduled: true });

    const result = await sendPushTest();
    expect(result).toEqual({ success: true, scheduled: true });
    expect(mocks.schedulePushTestAlert).toHaveBeenCalledWith("user-123");
  });

  it("routes sendCartolaEmailTest via API when available", async () => {
    const sendEmailApi = vi.fn().mockResolvedValue({ success: true, testedAt: "2026-10-30T00:00:00Z" });
    mocks.notificationApi.mockResolvedValue({ sendCartolaEmailTest: sendEmailApi });

    const result = await sendCartolaEmailTest();
    expect(result).toEqual({ success: true, testedAt: "2026-10-30T00:00:00Z" });
    expect(sendEmailApi).toHaveBeenCalledWith({
      leagueId,
      email: "user@exemplo.com",
      name: "Usuario",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mais/notificacoes");
  });

  it("falls back to legacy sendCartolaEmailTest when API is disabled", async () => {
    mocks.notificationApi.mockResolvedValue(null);
    mocks.sendCartolaReminderTest.mockResolvedValue({ providerMessageId: "msg-1" });

    const result = await sendCartolaEmailTest();
    expect(result.success).toBe(true);
    expect(mocks.sendCartolaReminderTest).toHaveBeenCalledWith({
      userId: "user-123",
      email: "user@exemplo.com",
      name: "Usuario",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mais/notificacoes");
  });

  it("falls back to legacy getPushPublicKey when API is disabled", async () => {
    mocks.notificationApi.mockResolvedValue(null);

    const result = await getPushPublicKey();
    expect(result.success).toBe(true);
    expect(result.publicKey).toBe("legacy-vapid-key");
  });

  it("routes setCartolaRemindersEnabled via API when available", async () => {
    const toggleApi = vi.fn().mockResolvedValue({ success: true });
    mocks.notificationApi.mockResolvedValue({ setCartolaRemindersEnabled: toggleApi });

    const result = await setCartolaRemindersEnabled(true);
    expect(result).toEqual({ success: true });
    expect(toggleApi).toHaveBeenCalledWith(leagueId, true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mais/notificacoes");
  });

  it("falls back to legacy setCartolaRemindersEnabled when API is disabled", async () => {
    mocks.notificationApi.mockResolvedValue(null);
    mocks.serviceClient.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leagues") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { cartola_email_tested_at: "2026-10-29T00:00:00Z" } }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "fantasy_rounds") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    });

    const result = await setCartolaRemindersEnabled(false);
    expect(result).toEqual({ success: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mais/notificacoes");
  });
});
