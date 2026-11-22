import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAccount, getSelectedLeague, readDashboardCallups } = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(), getSelectedLeague: vi.fn(), readDashboardCallups: vi.fn(),
}));
vi.mock("../auth", () => ({ getCurrentAccount }));
vi.mock("../league-context", () => ({ getSelectedLeague }));
vi.mock("../dashboard-callups", async (original) => ({
  ...await original<typeof import("../dashboard-callups")>(), readDashboardCallups,
}));

import { getHomeAgenda, getHomeMatchGoals } from "./dashboard";

function query(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

describe("home agenda", () => {
  const client = { rpc: vi.fn(), from: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks();
    getCurrentAccount.mockResolvedValue({ user: { id: "account" }, profile: { player_id: "me" }, client });
    getSelectedLeague.mockResolvedValue({ id: "league" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses one agenda RPC and preserves the player's entry and the round count", async () => {
    vi.stubEnv("HOME_AGENDA_V2_ENABLED", "true");
    client.rpc.mockResolvedValue({ data: {
      league: { match_duration: 10 },
      rounds: [{ id: "round", round_type: "official", participant_count: 0 }],
      callups: [{ id: "callup", round_id: "round", round_type: "official", confirmed: 9, waiting: 1, userEntry: { playerId: "me", status: "waitlist", position: 1 } }],
      liveMatch: null,
    } });
    expect(await getHomeAgenda()).toMatchObject({
      nextRound: { id: "round", confirmedPlayers: 9 },
      activeCallups: [{ id: "callup", userEntry: { status: "waitlist", position: 1 } }],
    });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("get_home_agenda_v2", { p_league_id: "league" });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("falls back to the agenda only and omits callups whose round has started", async () => {
    vi.stubEnv("HOME_AGENDA_V2_ENABLED", "true");
    client.from.mockReturnValue(query({ data: { id: "season" } }));
    client.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } }).mockResolvedValueOnce({ data: { league: {} } });
    readDashboardCallups.mockResolvedValue({ data: [
      { id: "started", round: { matches: [{ started_at: "2026-11-21T08:00:00Z" }] } },
      { id: "open", round: null, callup_entries: [{ player_id: "me", status: "confirmed", position: 1 }] },
    ] });
    expect(await getHomeAgenda()).toMatchObject({
      activeCallups: [{ id: "open", confirmed: 1, userEntry: { status: "confirmed" } }],
    });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(["get_home_agenda_v2", "get_home_agenda_read_model"]);
    expect(client.from).toHaveBeenCalledExactlyOnceWith("seasons");
  });

  it("propagates failed agenda reads instead of showing a false empty agenda", async () => {
    vi.stubEnv("HOME_AGENDA_V2_ENABLED", "false");
    client.from.mockReturnValue(query({ data: { id: "season" } }));
    readDashboardCallups.mockResolvedValue({ error: { code: "42501" } });
    await expect(getHomeAgenda()).rejects.toMatchObject({ code: "42501" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("never loads match events for a round outside the selected league", async () => {
    const rounds = query({ data: null });
    client.from.mockReturnValue(rounds);
    await expect(getHomeMatchGoals("other-round", "match")).rejects.toThrow("Rodada indisponível");
    expect(rounds.eq).toHaveBeenCalledWith("league_id", "league");
    expect(client.from).toHaveBeenCalledExactlyOnceWith("rounds");
  });
});
