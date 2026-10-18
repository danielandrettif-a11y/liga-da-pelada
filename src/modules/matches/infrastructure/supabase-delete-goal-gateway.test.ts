import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { supabaseDeleteGoalGateway } from "./supabase-delete-goal-gateway";

vi.mock("./match-scope", () => ({ getMatchState: vi.fn().mockResolvedValue({ id: "match-1" }) }));

function client() {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { match_id: "match-1" }, error: null }),
  };
  return {
    from: vi.fn(() => query),
    rpc: vi.fn().mockResolvedValue({
      data: { deleted: true, score_a: 1, score_b: 0, round_id: "round-1" }, error: null,
    }),
    query,
  };
}

describe("gateway de exclusão de gol", () => {
  it("confere escopo, filtra evento e preserva parâmetros da RPC", async () => {
    const db = client();
    const gateway = supabaseDeleteGoalGateway(
      db as unknown as Parameters<typeof supabaseDeleteGoalGateway>[0],
    );
    await gateway.ensureMatchSelected("match-1");
    expect(getMatchState).toHaveBeenCalledWith(db, "match-1");
    expect(await gateway.eventBelongsToMatch("event-1", "match-1")).toBe(true);
    expect(db.from).toHaveBeenCalledWith("match_events");
    expect(db.query.eq).toHaveBeenCalledWith("id", "event-1");
    expect(db.query.eq).toHaveBeenCalledWith("match_id", "match-1");
    expect(await gateway.deleteGoal("event-1", "match-1"))
      .toEqual({ deleted: true, score_a: 1, score_b: 0, round_id: "round-1" });
    expect(db.rpc).toHaveBeenCalledWith("delete_match_event", {
      p_event_id: "event-1", p_match_id: "match-1",
    });
  });

  it("não aceita evento ausente e propaga erro da RPC", async () => {
    const db = client();
    db.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const gateway = supabaseDeleteGoalGateway(
      db as unknown as Parameters<typeof supabaseDeleteGoalGateway>[0],
    );
    expect(await gateway.eventBelongsToMatch("event-1", "match-1")).toBe(false);
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "Acesso restrito" } });
    await expect(gateway.deleteGoal("event-1", "match-1"))
      .rejects.toThrow("Acesso restrito");
  });
});
