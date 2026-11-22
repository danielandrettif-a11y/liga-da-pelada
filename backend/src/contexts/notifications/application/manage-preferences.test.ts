import { describe, expect, it, vi } from "vitest";
import {
  getNotificationPreferences,
  getPushPublicKey,
  getPushSystemStatus,
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPreferences,
  type NotificationPreferencesRepository,
  type PushConfigurationProvider,
  type PushSubscriptionRepository,
} from "./manage-preferences.js";

describe("manage-preferences application service", () => {
  const actor = { userId: "00000000-0000-4000-8000-000000000001" };
  const leagueId = "00000000-0000-4000-8000-000000000002";

  it("returns public key when VAPID is configured", async () => {
    const provider: PushConfigurationProvider = {
      getPublicKey: () => "vapid-pub-key",
      isConfigured: () => true,
      getConfigurationError: () => null,
      isBackgroundAlertsConfigured: () => true,
    };

    const result = await getPushPublicKey(provider);
    expect(result).toEqual({
      success: true,
      publicKey: "vapid-pub-key",
      backgroundAlertsConfigured: true,
    });
  });

  it("returns error message when VAPID is incomplete", async () => {
    const provider: PushConfigurationProvider = {
      getPublicKey: () => undefined,
      isConfigured: () => false,
      getConfigurationError: () => "VAPID ausente",
      isBackgroundAlertsConfigured: () => false,
    };

    const result = await getPushPublicKey(provider);
    expect(result.success).toBe(false);
    expect(result.error).toBe("VAPID ausente");
  });

  it("gets push system status correctly", async () => {
    const provider: PushConfigurationProvider = {
      getPublicKey: () => "key",
      isConfigured: () => true,
      getConfigurationError: () => null,
      isBackgroundAlertsConfigured: () => true,
    };

    const status = await getPushSystemStatus(provider);
    expect(status).toEqual({
      pushConfigured: true,
      pushConfigurationError: null,
      backgroundAlertsConfigured: true,
    });
  });

  it("subscribes to push via repository", async () => {
    const repository: PushSubscriptionRepository = {
      saveSubscription: vi.fn().mockResolvedValue(true),
      removeSubscription: vi.fn(),
    };

    const subscription = {
      endpoint: "https://push.services.mozilla.com/123",
      expirationTime: null,
      keys: { p256dh: "key-p256", auth: "auth-token" },
    };

    const result = await subscribeToPush(actor, subscription, repository);
    expect(result).toEqual({ success: true });
    expect(repository.saveSubscription).toHaveBeenCalledWith(actor.userId, subscription);
  });

  it("unsubscribes from push via repository", async () => {
    const repository: PushSubscriptionRepository = {
      saveSubscription: vi.fn(),
      removeSubscription: vi.fn().mockResolvedValue(true),
    };

    const result = await unsubscribeFromPush(actor, "https://push.services.mozilla.com/123", repository);
    expect(result).toEqual({ success: true });
    expect(repository.removeSubscription).toHaveBeenCalledWith(
      actor.userId,
      "https://push.services.mozilla.com/123",
    );
  });

  it("reads and resolves notification preferences defaults", async () => {
    const repository: NotificationPreferencesRepository = {
      getPreferences: vi.fn().mockResolvedValue({
        preference: null,
        leagueSettings: { cartola_reminders_enabled: true, cartola_email_tested_at: null },
      }),
      updatePreferences: vi.fn(),
    };

    const prefs = await getNotificationPreferences(actor, leagueId, repository, true);
    expect(prefs).toEqual({
      matchPushEnabled: true,
      callupPushEnabled: true,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: true,
      collectivePushEnabled: true,
      collectiveEnabled: true,
      emailTestedAt: null,
      emailConfigured: true,
    });
  });

  it("updates notification preferences via repository", async () => {
    const repository: NotificationPreferencesRepository = {
      getPreferences: vi.fn(),
      updatePreferences: vi.fn().mockResolvedValue(true),
    };

    const input = {
      matchPushEnabled: false,
      callupPushEnabled: true,
      cartolaPushEnabled: false,
      cartolaEmailEnabled: true,
      collectivePushEnabled: false,
    };

    const result = await updateNotificationPreferences(actor, input, repository);
    expect(result).toEqual({ success: true });
    expect(repository.updatePreferences).toHaveBeenCalledWith(actor.userId, input);
  });
});

