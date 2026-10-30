import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  activeLeague: vi.fn(),
  activeSeason: vi.fn(),
  revalidatePath: vi.fn(),
  notificationApi: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  getCurrentAccount: mocks.account,
}));
vi.mock("./rounds", () => ({
  getActiveLeague: mocks.activeLeague,
}));
vi.mock("./seasons", () => ({
  getActiveSeason: mocks.activeSeason,
}));
vi.mock("@/modules/notifications/infrastructure/notification-api-session", () => ({
  notificationApiFor: mocks.notificationApi,
}));

import {
  getMyInboxNotifications,
  getMyInboxPreview,
  markInboxRead,
} from "./inbox";

const leagueId = "00000000-0000-4000-8000-000000000001";
const seasonId = "00000000-0000-4000-8000-000000000002";

describe("inbox actions via API gateway and legacy fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const createChain = (resolveValue: any = { data: null, error: null }) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve(resolveValue)),
        maybeSingle: vi.fn(() => Promise.resolve(resolveValue)),
        update: vi.fn(() => chain),
        then: (fn: any) => Promise.resolve(resolveValue).then(fn),
      };
      return chain;
    };

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "user_inbox_notifications") {
        return createChain({
          data: [
            {
              id: "notif-leg-1",
              title: "Legado",
              body: "Corpo Legado",
              href: "/cartola",
              state: "active",
              read_at: null,
              created_at: "2026-10-29T00:00:00Z",
              updated_at: "2026-10-29T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      return createChain({ data: null, error: null });
    });

    const client = { from: fromMock };

    mocks.account.mockResolvedValue({
      user: { id: "user-123" },
      client,
      profile: null,
    });
    mocks.activeLeague.mockResolvedValue({ id: leagueId, players_per_team: 5 });
    mocks.activeSeason.mockResolvedValue({ id: seasonId, number: 1, status: "active" });
  });

  it("routes getMyInboxPreview via API when available", async () => {
    const getInboxPreview = vi.fn().mockResolvedValue([
      {
        id: "notif-api-1",
        title: "Via API",
        body: "Corpo API",
        href: "/cartola",
        state: "active",
        read_at: null,
        created_at: "2026-10-29T00:00:00Z",
        updated_at: "2026-10-29T00:00:00Z",
      },
    ]);
    mocks.notificationApi.mockResolvedValue({ getInboxPreview });

    const result = await getMyInboxPreview();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("notif-api-1");
    expect(getInboxPreview).toHaveBeenCalled();
  });

  it("routes markInboxRead via API when available and revalidates paths", async () => {
    const markReadApi = vi.fn().mockResolvedValue({ success: true });
    mocks.notificationApi.mockResolvedValue({ markInboxRead: markReadApi });

    const result = await markInboxRead(["notif-api-1"]);
    expect(result).toEqual({ success: true });
    expect(markReadApi).toHaveBeenCalledWith(["notif-api-1"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/notificacoes");
  });

  it("routes getMyInboxNotifications via API when available", async () => {
    const syncAndListInbox = vi.fn().mockResolvedValue([
      {
        id: "notif-api-2",
        title: "Sincronizada",
        body: "Corpo",
        href: "/cartola",
        state: "active",
        read_at: null,
        created_at: "2026-10-29T00:00:00Z",
        updated_at: "2026-10-29T00:00:00Z",
      },
    ]);
    mocks.notificationApi.mockResolvedValue({ syncAndListInbox });

    const result = await getMyInboxNotifications();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("notif-api-2");
    expect(syncAndListInbox).toHaveBeenCalledWith(
      leagueId,
      expect.arrayContaining([
        expect.objectContaining({ type: "tactical_revolution_r2" }),
      ]),
    );
  });

  it("falls back to legacy Supabase query when API is unavailable", async () => {
    mocks.notificationApi.mockResolvedValue(null);

    const result = await getMyInboxPreview();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("notif-leg-1");
  });
});
