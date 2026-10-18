import { describe, expect, it, vi } from "vitest";
import { supabaseFantasyLineupGateway } from "./supabase-lineup-gateway";
import type { FantasyLineupSubmission } from "../domain/lineup-submission";

const input: FantasyLineupSubmission = {
  fantasySeasonId: "season-1", roundId: "round-1", playerIds: ["one"],
  slotAssignments: [{ playerId: "one", slotIndex: 0, slotRole: "GOL" }],
  captainId: "one", scorerId: null, assistId: null, challengeId: null,
  reservePlayerId: "two", reserveRole: "ATA",
};

function setup() {
  const roundQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { settings_snapshot: { players_per_team: 1 }, round: { league_id: "league-1" } }, error: null,
    }),
  };
  const testQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const db = {
    from: vi.fn((table: string) => table === "fantasy_rounds" ? roundQuery
      : table === "fantasy_test_sessions" ? testQuery : null),
    rpc: vi.fn().mockResolvedValue({ data: "lineup-1", error: null }),
  };
  const gateway = supabaseFantasyLineupGateway(db as unknown as Parameters<typeof supabaseFantasyLineupGateway>[0]);
  return { gateway, db, roundQuery, testQuery };
}

describe("gateway de escalação do Cartola", () => {
  it("lê rodada e sessão de teste filtradas pelo identificador", async () => {
    const { gateway, roundQuery, testQuery } = setup();
    expect(await gateway.loadRound("round-1")).toEqual({ leagueId: "league-1", playersPerTeam: 1 });
    expect(roundQuery.eq).toHaveBeenCalledWith("round_id", "round-1");
    expect(await gateway.hasTestSession("round-1")).toBe(false);
    expect(testQuery.eq).toHaveBeenCalledWith("round_id", "round-1");
    testQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "negado" } });
    await expect(gateway.hasTestSession("round-1")).rejects.toThrow("negado");
  });

  it("preserva os parâmetros das RPCs oficial e de teste", async () => {
    const { gateway, db } = setup();
    const slots = [{ player_id: "one", slot_index: 0, slot_role: "GOL" as const }];
    expect(await gateway.saveTest(input, slots)).toBeNull();
    expect(await gateway.saveRegular(input, slots)).toEqual({ lineupId: "lineup-1", error: null });
    expect(db.rpc).toHaveBeenNthCalledWith(1, "save_fantasy_test_lineup", {
      p_round_id: "round-1", p_player_ids: ["one"], p_captain_player_id: "one",
      p_top_scorer_player_id: null, p_top_assist_player_id: null,
      p_challenge_player_id: null, p_lineup_slots: slots,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "save_fantasy_lineup_with_reserve", {
      p_round_id: "round-1", p_player_ids: ["one"], p_captain_player_id: "one",
      p_top_scorer_player_id: null, p_top_assist_player_id: null,
      p_challenge_player_id: null, p_lineup_slots: slots,
      p_reserve_player_id: "two", p_reserve_slot_role: "ATA",
    });
  });

  it("não faz leitura separada depois da RPC e preserva erros de gravação", async () => {
    const { gateway, db } = setup();
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "Mercado fechado" } });
    expect(await gateway.saveRegular(input, [])).toEqual({ lineupId: null, error: "Mercado fechado" });
    expect(db.from).not.toHaveBeenCalled();
  });
});
