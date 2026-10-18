import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { supabaseFinishedGoalCorrectionGateway } from "./supabase-finished-goal-correction-gateway";

vi.mock("./match-scope", () => ({
  getMatchState: vi.fn().mockResolvedValue({ id: "match-1", round_id: "round-1" }),
}));

function client() {
  const eventQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { match_id: "match-1" }, error: null }),
  };
  const fantasyQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "fantasy-1" }, error: null }),
  };
  return {
    from: vi.fn((table: string) => table === "match_events" ? eventQuery : fantasyQuery),
    rpc: vi.fn().mockResolvedValue({
      data: { match_id: "match-1", round_id: "round-1" }, error: null,
    }),
    eventQuery,
    fantasyQuery,
  };
}

describe("gateway de correção de gol finalizado", () => {
  it("obtém o escopo por evento ou partida e usa a pelada selecionada", async () => {
    const db = client();
    const gateway = supabaseFinishedGoalCorrectionGateway(
      db as unknown as Parameters<typeof supabaseFinishedGoalCorrectionGateway>[0],
    );
    expect(await gateway.loadEventScope("event-1"))
      .toEqual({ matchId: "match-1", roundId: "round-1" });
    expect(db.eventQuery.eq).toHaveBeenCalledWith("id", "event-1");
    expect(getMatchState).toHaveBeenCalledWith(db, "match-1");
    expect(await gateway.loadMatchScope("match-1"))
      .toEqual({ matchId: "match-1", roundId: "round-1" });
    db.eventQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(gateway.loadEventScope("missing")).rejects.toThrow("Gol não encontrado.");
  });

  it("preserva os parâmetros das três RPCs", async () => {
    const db = client();
    const gateway = supabaseFinishedGoalCorrectionGateway(
      db as unknown as Parameters<typeof supabaseFinishedGoalCorrectionGateway>[0],
    );
    await gateway.removeGoal("event-1");
    await gateway.editGoal("event-1", "player-1", "assist-1");
    await gateway.addGoal("match-1", "team-1", "player-1", null);
    expect(db.rpc).toHaveBeenNthCalledWith(1, "correct_finished_goal", { p_event_id: "event-1" });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "correct_finished_goal_event", {
      p_event_id: "event-1", p_player_id: "player-1", p_assist_player_id: "assist-1",
    });
    expect(db.rpc).toHaveBeenNthCalledWith(3, "add_finished_goal_event", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_id: "player-1",
      p_assist_player_id: null,
    });
  });

  it("consulta a rodada do Cartola, reprocessa e propaga falhas", async () => {
    const db = client();
    const gateway = supabaseFinishedGoalCorrectionGateway(
      db as unknown as Parameters<typeof supabaseFinishedGoalCorrectionGateway>[0],
    );
    expect(await gateway.hasFantasyRound("round-1")).toBe(true);
    expect(db.fantasyQuery.eq).toHaveBeenCalledWith("round_id", "round-1");
    await gateway.reprocessFantasy("round-1");
    expect(db.rpc).toHaveBeenCalledWith("reprocess_fantasy_from_round", { p_round_id: "round-1" });

    db.fantasyQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "sem acesso" } });
    await expect(gateway.hasFantasyRound("round-1")).rejects.toThrow("sem acesso");
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "falha no Cartola" } });
    await expect(gateway.reprocessFantasy("round-1")).rejects.toThrow("falha no Cartola");
  });

  it("não confirma a mutação quando a RPC falha", async () => {
    const db = client();
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "gol ausente" } });
    const gateway = supabaseFinishedGoalCorrectionGateway(
      db as unknown as Parameters<typeof supabaseFinishedGoalCorrectionGateway>[0],
    );
    await expect(gateway.removeGoal("event-1")).rejects.toThrow("gol ausente");
  });
});
