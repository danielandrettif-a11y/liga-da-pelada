import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendPushTestNotification: vi.fn(),
  createServiceClient: vi.fn(),
  deliverPushTestAlert: vi.fn(),
}));

vi.mock("@/lib/push-notifications", () => ({
  sendPushTestNotification: mocks.sendPushTestNotification,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/modules/notifications/infrastructure/http-notification-gateway", () => ({
  httpNotificationGateway: vi.fn(() => ({
    deliverPushTestAlert: mocks.deliverPushTestAlert,
  })),
}));

import { POST } from "./route";

describe("POST /api/internal/push-test-alert", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      MATCH_TIMER_WEBHOOK_SECRET: "test-secret-123",
      ENABLE_NOTIFICATIONS_API: "false",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 when authorization header is invalid", async () => {
    const request = new Request("http://localhost/api/internal/push-test-alert", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
      body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000001" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when userId is not a valid UUID", async () => {
    const request = new Request("http://localhost/api/internal/push-test-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-123" },
      body: JSON.stringify({ userId: "invalid-id" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("routes through API gateway when ENABLE_NOTIFICATIONS_API=true", async () => {
    process.env.ENABLE_NOTIFICATIONS_API = "true";
    process.env.INTERNAL_API_URL = "http://backend.internal";

    mocks.deliverPushTestAlert.mockResolvedValue({ success: true, sent: 2 });

    const request = new Request("http://localhost/api/internal/push-test-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-123" },
      body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000001" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, sent: 2 });
    expect(mocks.deliverPushTestAlert).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "test-secret-123",
    );
  });

  it("falls back to legacy push notification delivery when flag is false", async () => {
    mocks.createServiceClient.mockReturnValue({});
    mocks.sendPushTestNotification.mockResolvedValue({ sent: 1, failed: 0 });

    const request = new Request("http://localhost/api/internal/push-test-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-123" },
      body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000001" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, sent: 1 });
    expect(mocks.sendPushTestNotification).toHaveBeenCalled();
  });
});

