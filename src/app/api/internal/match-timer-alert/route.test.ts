import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchMatchTimerThreshold: vi.fn(),
  createServiceClient: vi.fn(),
  dispatchMatchTimerAlert: vi.fn(),
}));

vi.mock("@/lib/actions/matches", () => ({
  dispatchMatchTimerThreshold: mocks.dispatchMatchTimerThreshold,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/modules/notifications/infrastructure/http-notification-gateway", () => ({
  httpNotificationGateway: vi.fn(() => ({
    dispatchMatchTimerAlert: mocks.dispatchMatchTimerAlert,
  })),
}));

import { POST } from "./route";

describe("POST /api/internal/match-timer-alert", () => {
  const originalEnv = process.env;
  const validMatchId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      MATCH_TIMER_WEBHOOK_SECRET: "test-timer-secret",
      NOTIFICATIONS_API_ENABLED: "false",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 when authorization header is invalid", async () => {
    const request = new Request("http://localhost/api/internal/match-timer-alert", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
      body: JSON.stringify({ matchId: validMatchId, threshold: "one_minute" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when body has invalid matchId or threshold", async () => {
    const request = new Request("http://localhost/api/internal/match-timer-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-timer-secret" },
      body: JSON.stringify({ matchId: "not-a-uuid", threshold: "one_minute" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("routes through API gateway when NOTIFICATIONS_API_ENABLED=true", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "true";
    process.env.INTERNAL_API_URL = "http://backend.internal";

    mocks.dispatchMatchTimerAlert.mockResolvedValue({ success: true });

    const request = new Request("http://localhost/api/internal/match-timer-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-timer-secret" },
      body: JSON.stringify({ matchId: validMatchId, threshold: "one_minute" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(mocks.dispatchMatchTimerAlert).toHaveBeenCalledWith(
      validMatchId,
      "one_minute",
      "test-timer-secret",
    );
  });

  it("handles too_early skipping with status 425 and Retry-After via gateway", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "true";
    process.env.INTERNAL_API_URL = "http://backend.internal";

    mocks.dispatchMatchTimerAlert.mockResolvedValue({
      success: true,
      skipped: true,
      reason: "too_early",
      secondsLeft: 3,
    });

    const request = new Request("http://localhost/api/internal/match-timer-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-timer-secret" },
      body: JSON.stringify({ matchId: validMatchId, threshold: "thirty_seconds" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(425);
    expect(response.headers.get("Retry-After")).toBe("1");
    const body = await response.json();
    expect(body.error).toContain("3 segundos");
  });

  it("falls back to legacy handler when flag is disabled", async () => {
    mocks.createServiceClient.mockReturnValue({});
    mocks.dispatchMatchTimerThreshold.mockResolvedValue({ success: true });

    const request = new Request("http://localhost/api/internal/match-timer-alert", {
      method: "POST",
      headers: { authorization: "Bearer test-timer-secret" },
      body: JSON.stringify({ matchId: validMatchId, threshold: "finished" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.dispatchMatchTimerThreshold).toHaveBeenCalled();
  });
});

