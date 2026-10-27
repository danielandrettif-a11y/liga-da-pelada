import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  selectedLeague: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  rosterApi: vi.fn(),
  unreadState: vi.fn(),
  unreadPlayers: vi.fn(),
  markThrough: vi.fn(),
  markSeen: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/lib/league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("./stats", () => ({ calculateRoundStats: vi.fn() }));
vi.mock("./overall", () => ({ refreshFluidOverallSafely: vi.fn() }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import {
  getRosterUnreadState, getUnreadRosterPlayers, markRosterActivitySeen, markRosterActivitySeenThrough,
} from "./registrations";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({
    user: { id: "admin-a" },
    isAdmin: true,
    client: { rpc: mocks.rpc },
  });
  mocks.selectedLeague.mockResolvedValue({ id: "league-a", role: "admin" });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.rosterApi.mockResolvedValue(null);
});

describe("leitura do elenco por pelada", () => {
  it("consulta apenas o marcador e os cadastros da pelada ativa", async () => {
    const markerEq = vi.fn();
    const eventIn = vi.fn();
    const members = {
      select: vi.fn(), eq: vi.fn(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ player_id: "player-a" }] }).then(resolve),
    };
    members.select.mockReturnValue(members);
    members.eq.mockReturnValue(members);
    const marker = {
      select: vi.fn(), eq: markerEq,
      maybeSingle: vi.fn().mockResolvedValue({ data: { last_seen_at: "2026-10-09T12:00:00.000Z" } }),
    };
    marker.select.mockReturnValue(marker);
    markerEq.mockReturnValue(marker);
    const events = {
      select: vi.fn(), in: eventIn, gt: vi.fn(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 2, error: null }).then(resolve),
    };
    events.select.mockReturnValue(events);
    eventIn.mockReturnValue(events);
    events.gt.mockReturnValue(events);
    const from = vi.fn((table: string) => table === "league_members" ? members
      : table === "admin_roster_reads" ? marker : events);
    mocks.account.mockResolvedValue({
      user: { id: "admin-a" }, isAdmin: true, client: { from, rpc: mocks.rpc },
    });

    expect((await getRosterUnreadState()).count).toBe(2);
    expect(members.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(markerEq).toHaveBeenCalledWith("league_id", "league-a");
    expect(eventIn).toHaveBeenCalledWith("player_id", ["player-a"]);
  });

  it("marca somente a pelada selecionada e envia a data ao banco", async () => {
    const seenThrough = "2026-10-09T12:00:00.000Z";
    expect(await markRosterActivitySeenThrough(seenThrough)).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("mark_roster_activity_seen_through", {
      p_league_id: "league-a",
      p_seen_through: seenThrough,
    });
  });

  it("marca a leitura total somente na pelada selecionada", async () => {
    expect(await markRosterActivitySeen()).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("mark_roster_activity_seen", { p_league_id: "league-a" });
  });

  it("não aceita ação quando a pelada selecionada não é administrada", async () => {
    mocks.selectedLeague.mockResolvedValue({ id: "league-b", role: "player" });
    expect((await markRosterActivitySeen()).success).toBe(false);
    expect((await markRosterActivitySeenThrough("2026-10-10T12:00:00.000Z")).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("usa a API de elenco para leitura e confirmação quando a flag está ativa", async () => {
    mocks.rosterApi.mockResolvedValue({
      getRosterUnreadState: mocks.unreadState,
      getUnreadRosterPlayers: mocks.unreadPlayers,
      markRosterActivitySeenThrough: mocks.markThrough,
      markRosterActivitySeen: mocks.markSeen,
    });
    mocks.unreadState.mockResolvedValue({ count: 2, lastSeenAt: "2026-10-09T12:00:00.000Z" });
    mocks.unreadPlayers.mockResolvedValue({ playerIds: ["player-a"], seenThrough: "2026-10-10T12:00:00.000Z" });
    await expect(getRosterUnreadState()).resolves.toMatchObject({ count: 2 });
    await expect(getUnreadRosterPlayers()).resolves.toMatchObject({ playerIds: ["player-a"] });
    await expect(markRosterActivitySeenThrough("2026-10-10T12:00:00.000Z")).resolves.toEqual({ success: true });
    await expect(markRosterActivitySeen()).resolves.toEqual({ success: true });
    expect(mocks.unreadState).toHaveBeenCalledWith("league-a");
    expect(mocks.markThrough).toHaveBeenCalledWith("league-a", "2026-10-10T12:00:00.000Z");
    expect(mocks.markSeen).toHaveBeenCalledWith("league-a");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
