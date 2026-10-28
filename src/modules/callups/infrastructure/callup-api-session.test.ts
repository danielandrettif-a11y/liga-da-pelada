import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { callupApiFor } from "./callup-api-session";

const originalEnabled = process.env.CALLUPS_API_ENABLED;
const originalUrl = process.env.CALLUPS_BACKEND_URL;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.CALLUPS_API_ENABLED;
  else process.env.CALLUPS_API_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.CALLUPS_BACKEND_URL;
  else process.env.CALLUPS_BACKEND_URL = originalUrl;
});

describe("callupApiFor", () => {
  it("keeps the legacy path when the feature flag is disabled", async () => {
    delete process.env.CALLUPS_API_ENABLED;
    const getSession = vi.fn();
    await expect(callupApiFor({ auth: { getSession } })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("requires a server URL when enabled", async () => {
    process.env.CALLUPS_API_ENABLED = "true";
    delete process.env.CALLUPS_BACKEND_URL;
    const getSession = vi.fn();
    await expect(callupApiFor({ auth: { getSession } })).rejects.toThrow("não configurada");
  });

  it("creates the HTTP adapter with a verified server session", async () => {
    process.env.CALLUPS_API_ENABLED = "true";
    process.env.CALLUPS_BACKEND_URL = "http://backend:3001";
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    await expect(callupApiFor({ auth: { getSession } })).resolves.toMatchObject({
      listActive: expect.any(Function),
      openCallup: expect.any(Function),
      joinCallup: expect.any(Function),
      leaveCallup: expect.any(Function),
    });
  });
});
