import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  NotificationPreferencesRepository,
  PushConfigurationProvider,
  PushSubscriptionRepository,
} from "../application/manage-preferences.js";
import { createApp } from "../../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture() {
  const pushConfig: PushConfigurationProvider = {
    getPublicKey: () => "vapid-public-key",
    isConfigured: () => true,
    getConfigurationError: () => null,
    isBackgroundAlertsConfigured: () => true,
  };

  const pushSubscriptions: PushSubscriptionRepository = {
    saveSubscription: vi.fn().mockResolvedValue(true),
    removeSubscription: vi.fn().mockResolvedValue(true),
  };

  const preferences: NotificationPreferencesRepository = {
    getPreferences: vi.fn().mockResolvedValue({
      preference: {
        match_push_enabled: true,
        callup_push_enabled: true,
        cartola_push_enabled: true,
        cartola_email_enabled: true,
        collective_push_enabled: true,
      },
      leagueSettings: {
        cartola_reminders_enabled: true,
        cartola_email_tested_at: "2026-10-29T10:00:00Z",
      },
    }),
    updatePreferences: vi.fn().mockResolvedValue(true),
  };

  const verifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001" }),
  };

  const app = createApp({
    goalsEnabled: false,
    notificationsEnabled: true,
    verifier,
    repository: {} as any,
    inboxRepository: {} as any,
    pushConfig,
    pushSubscriptions,
    preferencesRepository: preferences,
    emailConfigured: true,
    logger: false,
  });
  apps.push(app);

  return { app, pushConfig, pushSubscriptions, preferences, verifier };
}

describe("preferences and push routes", () => {
  it("GET /api/notifications/push/public-key returns vapid key", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/push/public-key",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      publicKey: "vapid-public-key",
      backgroundAlertsConfigured: true,
    });
  });

  it("GET /api/notifications/push/status returns push status", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/push/status",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pushConfigured: true,
      pushConfigurationError: null,
      backgroundAlertsConfigured: true,
    });
  });

  it("POST /api/notifications/push/subscribe saves subscription for authenticated user", async () => {
    const { app, pushSubscriptions } = fixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications/push/subscribe",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        endpoint: "https://push.services.mozilla.com/123",
        expirationTime: null,
        keys: { p256dh: "key-p256", auth: "auth-key" },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(pushSubscriptions.saveSubscription).toHaveBeenCalled();
  });

  it("POST /api/notifications/push/unsubscribe deletes subscription", async () => {
    const { app, pushSubscriptions } = fixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications/push/unsubscribe",
      headers: { authorization: "Bearer valid-token" },
      payload: { endpoint: "https://push.services.mozilla.com/123" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(pushSubscriptions.removeSubscription).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "https://push.services.mozilla.com/123",
    );
  });

  it("GET /api/notifications/preferences/:leagueId returns preferences", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/preferences/00000000-0000-4000-8000-000000000002",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().matchPushEnabled).toBe(true);
  });

  it("PUT /api/notifications/preferences updates preferences", async () => {
    const { app, preferences } = fixture();
    const response = await app.inject({
      method: "PUT",
      url: "/api/notifications/preferences",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        matchPushEnabled: false,
        callupPushEnabled: true,
        cartolaPushEnabled: false,
        cartolaEmailEnabled: true,
        collectivePushEnabled: false,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(preferences.updatePreferences).toHaveBeenCalled();
  });
});

