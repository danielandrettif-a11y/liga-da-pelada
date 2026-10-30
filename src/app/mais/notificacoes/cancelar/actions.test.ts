import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCartolaUnsubscribeToken: vi.fn(),
  createServiceClient: vi.fn(),
  cancelCartolaEmailRemindersApi: vi.fn(),
}));

vi.mock("@/lib/cartola-reminders", () => ({
  verifyCartolaUnsubscribeToken: mocks.verifyCartolaUnsubscribeToken,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/modules/notifications/infrastructure/http-notification-gateway", () => ({
  httpNotificationGateway: vi.fn(() => ({
    cancelCartolaEmailReminders: mocks.cancelCartolaEmailRemindersApi,
  })),
}));

import { cancelCartolaEmailReminders } from "./actions";

describe("cancelCartolaEmailReminders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      NOTIFICATIONS_API_ENABLED: "false",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("routes via API gateway when NOTIFICATIONS_API_ENABLED=true", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "true";
    process.env.INTERNAL_API_URL = "http://backend.internal";

    mocks.cancelCartolaEmailRemindersApi.mockResolvedValue({ success: true });

    const result = await cancelCartolaEmailReminders("user-1", "token-valid");
    expect(result).toEqual({ success: true });
    expect(mocks.cancelCartolaEmailRemindersApi).toHaveBeenCalledWith("user-1", "token-valid");
  });

  it("falls back to legacy verification and updates user preferences", async () => {
    mocks.verifyCartolaUnsubscribeToken.mockReturnValue(true);
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    });

    const result = await cancelCartolaEmailReminders("user-1", "token-valid");
    expect(result).toEqual({ success: true });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", cartola_email_enabled: false }),
      expect.anything(),
    );
  });

  it("rejects when token is invalid in legacy fallback", async () => {
    mocks.verifyCartolaUnsubscribeToken.mockReturnValue(false);

    const result = await cancelCartolaEmailReminders("user-1", "token-invalid");
    expect(result).toEqual({ success: false, error: "Este link de cancelamento é inválido." });
  });
});

