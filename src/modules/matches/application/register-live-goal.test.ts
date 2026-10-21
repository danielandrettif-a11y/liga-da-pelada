import { describe, expect, it, vi } from "vitest";
import { registerLiveGoal, type RegisterGoalGateway } from "./register-live-goal";

function gateway(): RegisterGoalGateway & {
  saveGoal: ReturnType<typeof vi.fn>;
} {
  return {
    saveGoal: vi.fn().mockResolvedValue({
      event_id: "event-1", idempotent: false, score_a: 2, score_b: 1, round_id: "round-1",
    }),
  };
}

const input = { match_id: "match-1", team_id: "team-1", player_id: "player-1", idempotency_key: "goal-1" };

describe("registro de gol ao vivo", () => {
  it("não consulta nem grava quando faltam dados", async () => {
    const db = gateway();
    expect(await registerLiveGoal({ ...input, player_id: "" }, db))
      .toEqual({ success: false, error: "Dados do gol incompletos." });
    expect(db.saveGoal).not.toHaveBeenCalled();
  });

  it("usa uma única RPC autorizada e devolve placar e idempotência", async () => {
    const db = gateway();
    expect(await registerLiveGoal(input, db)).toEqual({
      success: true, roundId: "round-1", eventId: "event-1", idempotent: false, scoreA: 2, scoreB: 1,
    });
    expect(db.saveGoal).toHaveBeenCalledWith(input);
  });

  it("preserva o resultado idempotente retornado pela RPC", async () => {
    const db = gateway();
    db.saveGoal.mockResolvedValue({ event_id: "event-1", idempotent: true, score_a: 2, score_b: 1 });
    expect(await registerLiveGoal(input, db)).toMatchObject({ success: true, idempotent: true, eventId: "event-1" });
  });
});
