import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { supabaseGoalGateway } from "./supabase-goal-gateway";

vi.mock("./match-scope", () => ({ getMatchState: vi.fn().mockResolvedValue({ id: "match-1" }) }));

describe("gateway de gols ao vivo", () => {
  it("confere a partida e preserva todos os parâmetros da RPC transacional", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { event_id: "event-1", score_a: 1, score_b: 0, round_id: "round-1" }, error: null,
    });
    const client = { rpc } as unknown as Parameters<typeof supabaseGoalGateway>[0];
    const gateway = supabaseGoalGateway(client);
    await gateway.ensureMatchSelected("match-1");
    expect(getMatchState).toHaveBeenCalledWith(client, "match-1");

    expect(await gateway.saveGoal({
      match_id: "match-1", team_id: "team-1", player_id: "player-1", assist_player_id: "player-2",
      minute: 7, idempotency_key: "key-1", is_own_goal: true,
    })).toEqual({ event_id: "event-1", score_a: 1, score_b: 0, round_id: "round-1" });
    expect(rpc).toHaveBeenCalledWith("register_goal", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_id: "player-1", p_assist_player_id: "player-2",
      p_minute: 7, p_idempotency_key: "key-1", p_is_own_goal: true,
    });
  });

  it("usa valores padrão e propaga erro da RPC", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "partida encerrada" } });
    const gateway = supabaseGoalGateway({ rpc } as unknown as Parameters<typeof supabaseGoalGateway>[0]);
    const input = { match_id: "match-1", team_id: "team-1", player_id: "player-1" };
    expect(await gateway.saveGoal(input)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("register_goal", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_id: "player-1", p_assist_player_id: null,
      p_minute: null, p_idempotency_key: null, p_is_own_goal: false,
    });
    await expect(gateway.saveGoal(input)).rejects.toThrow("partida encerrada");
  });
});
