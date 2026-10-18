import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { buildQuickStartSuggestion } from "./quick-start-suggestion";
import { supabaseFinishMatchGateway } from "./supabase-finish-match-gateway";

vi.mock("./match-scope", () => ({
  getMatchState: vi.fn().mockResolvedValue({
    round_id: "round-1", status: "live", timer_accumulated_seconds: 12,
    timer_started_at: null, eligibility_elapsed_offset_seconds: 3,
  }),
}));
vi.mock("./quick-start-suggestion", () => ({
  buildQuickStartSuggestion: vi.fn().mockResolvedValue({ next: "match-2" }),
}));

function client() {
  const matchQuery = {
    update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({
      data: { id: "match-1", round_id: "round-1", score_a: 2, score_b: 1 }, error: null,
    }),
  };
  const playersQuery = {
    update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue({ error: null }),
    then: (resolve: (result: { error: null }) => void) => resolve({ error: null }),
  };
  const from = vi.fn((table: string) => table === "matches" ? matchQuery : playersQuery);
  return { from, matchQuery, playersQuery };
}

describe("gateway de encerramento de partida", () => {
  it("mapeia estado e atualização condicional da partida", async () => {
    const db = client();
    const gateway = supabaseFinishMatchGateway(db as unknown as Parameters<typeof supabaseFinishMatchGateway>[0]);
    expect(await gateway.loadCurrent("match-1")).toEqual({
      roundId: "round-1", status: "live", timerAccumulatedSeconds: 12,
      timerStartedAt: null, eligibilityElapsedOffsetSeconds: 3,
    });
    expect(getMatchState).toHaveBeenCalledWith(db, "match-1");
    expect(await gateway.markFinished("match-1", 75)).toMatchObject({ id: "match-1", round_id: "round-1" });
    expect(db.matchQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "finished", timer_started_at: null, timer_accumulated_seconds: 75,
    }));
    expect(db.matchQuery.neq).toHaveBeenCalledWith("status", "finished");
  });

  it("grava o tempo mesmo após trigger desativar participantes e prepara a próxima partida", async () => {
    const db = client();
    const gateway = supabaseFinishMatchGateway(db as unknown as Parameters<typeof supabaseFinishMatchGateway>[0]);
    await gateway.setExitTimes("match-1", 82);
    await gateway.deactivateParticipants("match-1");
    expect(db.playersQuery.update).toHaveBeenNthCalledWith(1, { left_elapsed_seconds: 82 });
    expect(db.playersQuery.is).toHaveBeenCalledWith("left_elapsed_seconds", null);
    expect(db.playersQuery.update).toHaveBeenNthCalledWith(2, { is_active: false });
    expect(db.playersQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(await gateway.buildQuickStart("round-1", "match-1")).toEqual({ next: "match-2" });
    expect(buildQuickStartSuggestion).toHaveBeenCalledWith(db, "round-1", "match-1");
  });
});
