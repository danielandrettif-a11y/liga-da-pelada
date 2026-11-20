import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  memberships: vi.fn(),
  redirect: vi.fn((url: URL) => ({ redirect: url.pathname + url.search })),
  next: vi.fn(() => ({ cookies: { set: vi.fn() } })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: mocks.memberships }),
      }),
    }),
  }),
}));
vi.mock("next/server", () => ({
  NextResponse: { next: mocks.next, redirect: mocks.redirect },
}));
vi.mock("@/lib/supabase/server-config", () => ({
  supabaseServerConfig: () => ({ url: "http://test", cookieName: "session" }),
}));
vi.mock("@/lib/siteUrl", () => ({ requestOrigin: () => "https://example.com" }));

import proxy from "./proxy";
import { ENTRY_FLOW_DONE_COOKIE, ENTRY_FLOW_VERSION } from "@/lib/entry-flow";

function request(path: string) {
  return {
    headers: new Headers(),
    nextUrl: new URL(path, "https://example.com"),
    cookies: {
      get: (name: string) => name === "active_league_id"
        ? { value: "league-1" }
        : name === ENTRY_FLOW_DONE_COOKIE ? { value: String(ENTRY_FLOW_VERSION) } : undefined,
      getAll: () => [],
      set: vi.fn(),
    },
  } as never;
}

describe("proxy league access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("blocks a quick league from the ranking", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { league_id: "league-1", role: "player", leagues: { feature_tier: "quick" } },
    ] });
    expect(await proxy(request("/ranking"))).toEqual({ redirect: "/rodadas" });
  });

  it("blocks a basic league from Cartola", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { league_id: "league-1", role: "admin", leagues: { feature_tier: "basic" } },
    ] });
    expect(await proxy(request("/cartola"))).toEqual({ redirect: "/mais?upgrade_required=1" });
  });

  it("permits ranking for a complete league and supports array relationships", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { league_id: "league-1", role: "player", leagues: [{ feature_tier: "complete" }] },
    ] });
    expect(await proxy(request("/ranking"))).toHaveProperty("cookies");
  });

  it("blocks a non-admin from administration", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { league_id: "league-1", role: "player", leagues: { feature_tier: "complete" } },
    ] });
    expect(await proxy(request("/admin/liga"))).toEqual({ redirect: "/lobby" });
  });
});
