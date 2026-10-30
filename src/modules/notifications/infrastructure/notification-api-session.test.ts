import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { notificationApiFor } from "./notification-api-session";

describe("notificationApiFor session factory", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when NOTIFICATIONS_API_ENABLED is not 'true'", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "false";
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "token" } },
          error: null,
        }),
      },
    };

    const api = await notificationApiFor(client as any);
    expect(api).toBeNull();
  });

  it("returns null when client is null", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "true";
    const api = await notificationApiFor(null);
    expect(api).toBeNull();
  });

  it("returns null when session has no access_token", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "true";
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    };

    const api = await notificationApiFor(client as any);
    expect(api).toBeNull();
  });

  it("returns gateway instance when flag is enabled and token is present", async () => {
    process.env.NOTIFICATIONS_API_ENABLED = "true";
    process.env.NOTIFICATIONS_BACKEND_URL = "http://backend.local";
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "valid-token" } },
          error: null,
        }),
      },
    };

    const api = await notificationApiFor(client as any);
    expect(api).not.toBeNull();
  });
});

