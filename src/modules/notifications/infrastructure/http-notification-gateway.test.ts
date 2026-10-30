import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  httpNotificationGateway,
  NotificationApiError,
} from "./http-notification-gateway";

describe("httpNotificationGateway", () => {
  const backendUrl = "http://backend.local";
  const accessToken = "valid-token";
  const gateway = httpNotificationGateway(backendUrl, accessToken);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/notifications/inbox/preview with bearer authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: "notif-1",
          title: "Aviso",
          body: "Corpo",
          href: "/cartola",
          state: "active",
          read_at: null,
          created_at: "2026-10-29T00:00:00Z",
          updated_at: "2026-10-29T00:00:00Z",
        },
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const preview = await gateway.getInboxPreview();
    expect(preview).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/inbox/preview",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer valid-token",
        }),
      }),
    );
  });

  it("calls /api/notifications/inbox/read with ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.markInboxRead(["notif-1"]);
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/inbox/read",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["notif-1"] }),
      }),
    );
  });

  it("calls /api/notifications/inbox/sync with leagueId and desired items", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const desired = [
      {
        type: "announcement",
        key: "announcement:1",
        title: "Título",
        body: "Corpo",
        href: "/cartola",
      },
    ];

    const result = await gateway.syncAndListInbox("league-1", desired);
    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/inbox/sync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ leagueId: "league-1", desired }),
      }),
    );
  });

  it("calls /api/notifications/push/public-key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        publicKey: "vapid-pub",
        backgroundAlertsConfigured: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.getPushPublicKey();
    expect(result.success).toBe(true);
    expect(result.publicKey).toBe("vapid-pub");
  });

  it("calls /api/notifications/push/status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        pushConfigured: true,
        pushConfigurationError: null,
        backgroundAlertsConfigured: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.getPushSystemStatus();
    expect(result.pushConfigured).toBe(true);
  });

  it("calls /api/notifications/push/subscribe", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const subscription = {
      endpoint: "https://push.services.mozilla.com/123",
      expirationTime: null,
      keys: { p256dh: "key-p256", auth: "auth-key" },
    };

    const result = await gateway.subscribeToPush(subscription);
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/push/subscribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(subscription),
      }),
    );
  });

  it("calls /api/notifications/push/unsubscribe", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.unsubscribeFromPush("https://push.services.mozilla.com/123");
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/push/unsubscribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ endpoint: "https://push.services.mozilla.com/123" }),
      }),
    );
  });

  it("calls /api/notifications/preferences/:leagueId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        matchPushEnabled: true,
        callupPushEnabled: true,
        cartolaPushEnabled: true,
        cartolaEmailEnabled: true,
        collectivePushEnabled: true,
        collectiveEnabled: false,
        emailTestedAt: null,
        emailConfigured: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.getNotificationPreferences("league-123");
    expect(result?.matchPushEnabled).toBe(true);
  });

  it("calls PUT /api/notifications/preferences", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      matchPushEnabled: false,
      callupPushEnabled: true,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: true,
      collectivePushEnabled: true,
    };

    const result = await gateway.updateNotificationPreferences(input);
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(input),
      }),
    );
  });

  it("calls POST /api/notifications/test-push", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, scheduled: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.sendPushTest();
    expect(result).toEqual({ success: true, scheduled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/test-push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer valid-token",
        }),
      }),
    );
  });

  it("calls POST /api/notifications/test-cartola-email with league and admin data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, testedAt: "2026-10-30T00:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.sendCartolaEmailTest({
      leagueId: "league-123",
      email: "admin@pelada.com",
      name: "Admin",
    });
    expect(result).toEqual({ success: true, testedAt: "2026-10-30T00:00:00Z" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/test-cartola-email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          leagueId: "league-123",
          email: "admin@pelada.com",
          name: "Admin",
        }),
      }),
    );
  });

  it("calls POST /api/internal/notifications/push-test-alert with bearer webhook secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, sent: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.deliverPushTestAlert("user-123", "secret-key");
    expect(result).toEqual({ success: true, sent: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/internal/notifications/push-test-alert",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret-key",
          "content-type": "application/json",
        }),
        body: JSON.stringify({ userId: "user-123" }),
      }),
    );
  });

  it("calls POST /api/notifications/cartola/reminders/toggle", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.setCartolaRemindersEnabled("league-123", true);
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/cartola/reminders/toggle",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ leagueId: "league-123", enabled: true }),
      }),
    );
  });

  it("calls POST /api/notifications/cartola/reminders/cancel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.cancelCartolaEmailReminders("user-123", "token-abc");
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/notifications/cartola/reminders/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "user-123", token: "token-abc" }),
      }),
    );
  });

  it("calls POST /api/internal/notifications/cartola-reminder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, sent: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = { roundId: "round-1", milestone: "24h", targetAt: "2026-11-01T00:00:00Z" };
    const result = await gateway.relayOrDispatchCartolaReminder(job, "secret-123");
    expect(result).toEqual({ success: true, sent: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/internal/notifications/cartola-reminder",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret-123",
        }),
        body: JSON.stringify(job),
      }),
    );
  });

  it("calls POST /api/internal/matches/:matchId/timer/dispatch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, skipped: true, reason: "already_alerted" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gateway.dispatchMatchTimerAlert("match-123", "finished", "secret-456");
    expect(result).toEqual({ success: true, skipped: true, reason: "already_alerted" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.local/api/internal/matches/match-123/timer/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret-456",
        }),
        body: JSON.stringify({ threshold: "finished" }),
      }),
    );
  });

  it("throws NotificationApiError when fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "Payload inválido" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(gateway.getInboxPreview()).rejects.toThrow(NotificationApiError);
  });
});
