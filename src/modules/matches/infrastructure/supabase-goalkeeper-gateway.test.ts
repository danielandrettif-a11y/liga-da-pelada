import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { supabaseGoalkeeperGateway } from "./supabase-goalkeeper-gateway";

vi.mock("./match-scope", () => ({ getMatchState: vi.fn().mockResolvedValue({
  round_id: "round-1", status: "live", team_a_id: "team-1", team_b_id: "team-2",
}) }));

function client() {
  const teamQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "team-1", round_id: "round-1" }, error: null }),
    then: (resolve: (result: { error: null }) => void) => resolve({ error: null }),
  };
  const playerQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { player_id: "player-1" }, error: null }),
  };
  const from = vi.fn((table: string) => table === "teams" ? teamQuery : playerQuery);
  const rpc = vi.fn().mockResolvedValue({ data: { goalkeeper_player_id: "player-1" }, error: null });
  return { from, rpc, teamQuery, playerQuery };
}

describe("gateway de goleiros", () => {
  it("filtra goleiro fixo pela rodada e pelada e confirma jogador do time", async () => {
    const db = client();
    const gateway = supabaseGoalkeeperGateway(db as unknown as Parameters<typeof supabaseGoalkeeperGateway>[0]);
    expect(await gateway.findRoundTeam("round-1", "team-1", "league-1"))
      .toEqual({ team: { roundId: "round-1" }, error: null });
    expect(db.teamQuery.eq).toHaveBeenCalledWith("id", "team-1");
    expect(db.teamQuery.eq).toHaveBeenCalledWith("round_id", "round-1");
    expect(db.teamQuery.eq).toHaveBeenCalledWith("round.league_id", "league-1");
    expect(await gateway.isTeamPlayer("team-1", "player-1")).toBe(true);
    expect(db.playerQuery.eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(db.playerQuery.eq).toHaveBeenCalledWith("player_id", "player-1");
    await gateway.setFixedGoalkeeper("team-1", "player-1");
    expect(db.teamQuery.update).toHaveBeenCalledWith({ fixed_goalkeeper_player_id: "player-1" });
  });

  it("lê partida no escopo selecionado e envia dica saneada para a RPC", async () => {
    const db = client();
    const gateway = supabaseGoalkeeperGateway(db as unknown as Parameters<typeof supabaseGoalkeeperGateway>[0]);
    expect(await gateway.loadMatch("match-1")).toEqual({
      roundId: "round-1", status: "live", teamAId: "team-1", teamBId: "team-2",
    });
    expect(getMatchState).toHaveBeenCalledWith(db, "match-1");
    expect(await gateway.changeMatchGoalkeeper("match-1", "team-1", "player-1", -8))
      .toEqual({ goalkeeper_player_id: "player-1" });
    expect(db.rpc).toHaveBeenCalledWith("change_match_goalkeeper", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_id: "player-1", p_elapsed_seconds: 0,
    });
    await gateway.changeMatchGoalkeeper("match-1", "team-1", "player-1");
    expect(db.rpc).toHaveBeenLastCalledWith("change_match_goalkeeper", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_id: "player-1", p_elapsed_seconds: null,
    });
  });

  it("propaga erro da RPC sem fingir que a troca ocorreu", async () => {
    const db = client();
    db.rpc.mockResolvedValue({ data: null, error: { message: "partida encerrada" } });
    const gateway = supabaseGoalkeeperGateway(db as unknown as Parameters<typeof supabaseGoalkeeperGateway>[0]);
    await expect(gateway.changeMatchGoalkeeper("match-1", "team-1", "player-1"))
      .rejects.toThrow("partida encerrada");
  });
});
