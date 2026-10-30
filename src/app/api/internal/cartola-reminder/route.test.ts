import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchCartolaReminder: vi.fn(),
  scheduleCartolaReminderJob: vi.fn(),
  relayOrDispatchCartolaReminder: vi.fn(),
}));

vi.mock("@/lib/cartola-reminders", () => ({
  dispatchCartolaReminder: mocks.dispatchCartolaReminder,
}));

vi.mock("@/lib/cartola-reminder-scheduler", () => ({
  scheduleCartolaReminderJob: mocks.scheduleCartolaReminderJob,
}));

vi.mock("@/modules/notifications/infrastructure/http-notification-gateway", () => ({
  httpNotificationGateway: vi.fn(() => ({
    relayOrDispatchCartolaReminder: mocks.relayOrDispatchCartolaReminder,
  })),
}));

import { POST } from "./route";

describe("POST /api/internal/cartola-reminder", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      MATCH_TIMER_WEBHOOK_SECRET: "test-secret-456",
      ENABLE_NOTIFICATIONS_API: "false",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 when authorization header is invalid", async () => {
    const request = new Request("http://localhost/api/internal/cartola-reminder", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: JSON.stringify({ roundId: "round-1" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("skips obsolete milestones immediately", async () => {
    const request = new Request("http://localhost/api/internal/cartola-reminder", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-456" },
      body: JSON.stringify({ roundId: "round-1", milestone: "opening" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: "obsolete-milestone" });
  });

  it("routes through API gateway when ENABLE_NOTIFICATIONS_API=true", async () => {
    process.env.ENABLE_NOTIFICATIONS_API = "true";
    process.env.INTERNAL_API_URL = "http://backend.internal";

    mocks.relayOrDispatchCartolaReminder.mockResolvedValue({ success: true, sent: 3 });

    const job = {
      roundId: "round-1",
      milestone: "24h",
      targetAt: new Date().toISOString(),
      roundStartAt: new Date().toISOString(),
    };

    const request = new Request("http://localhost/api/internal/cartola-reminder", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-456" },
      body: JSON.stringify(job),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, sent: 3 });
    expect(mocks.relayOrDispatchCartolaReminder).toHaveBeenCalledWith(job, "test-secret-456");
  });

  it("relays reminder job when remaining time is greater than 15s in legacy mode", async () => {
    const futureTarget = new Date(Date.now() + 60_000).toISOString();
    const job = {
      roundId: "round-1",
      milestone: "24h",
      targetAt: futureTarget,
      roundStartAt: futureTarget,
    };

    const request = new Request("http://localhost/api/internal/cartola-reminder", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-456" },
      body: JSON.stringify(job),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ relayed: true });
    expect(mocks.scheduleCartolaReminderJob).toHaveBeenCalledWith(job);
  });
});

