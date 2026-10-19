import { describe, expect, it, vi } from "vitest";
import { supabaseFantasyAdminCommandGateway } from "./supabase-admin-command-gateway";

function query(data: unknown = { id: "row" }) {
  const value: any = {
    select: vi.fn(() => value), eq: vi.fn(() => value), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return value;
}

describe("supabaseFantasyAdminCommandGateway", () => {
  it("escopa temporada e rodada pela pelada", async () => {
    const season = query({ id: "fantasy-a" });
    const round = query({ id: "round-a" });
    const client = { from: vi.fn((table: string) => table === "fantasy_seasons" ? season : round), rpc: vi.fn() } as any;
    const gateway = supabaseFantasyAdminCommandGateway(client, vi.fn());
    expect(await gateway.findFantasySeasonId("season-a", "league-a")).toBe("fantasy-a");
    expect(await gateway.roundBelongsToLeague("round-a", "league-a")).toBe(true);
    expect(season.eq).toHaveBeenCalledWith("season_id", "season-a");
    expect(season.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(round.eq).toHaveBeenCalledWith("league_id", "league-a");
  });

  it("encaminha configurações, reprocessamento e sessões às RPCs corretas", async () => {
    const client = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: { affected_finished_rounds: 2 }, error: null }) } as any;
    const rebuild = vi.fn().mockResolvedValue({ success: true });
    const gateway = supabaseFantasyAdminCommandGateway(client, rebuild);
    await gateway.updateSettings("league-a", { captainMultiplier: 2 });
    expect(await gateway.reprocessRound("round-a", "current")).toEqual({ affectedRounds: 2, error: null });
    await gateway.changeTestSession("round-a", "reset");
    expect(client.rpc).toHaveBeenNthCalledWith(1, "update_fantasy_settings_for_league", {
      p_league_id: "league-a", p_settings: { captainMultiplier: 2 },
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "reprocess_fantasy_with_current_rules", { p_round_id: "round-a" });
    expect(client.rpc).toHaveBeenNthCalledWith(3, "reset_fantasy_test_session", { p_round_id: "round-a" });
  });
});
