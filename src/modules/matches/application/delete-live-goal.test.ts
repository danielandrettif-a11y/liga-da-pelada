import { describe, expect, it, vi } from "vitest";
import { deleteLiveGoal, type DeleteLiveGoalGateway } from "./delete-live-goal";

function gateway(): DeleteLiveGoalGateway & {
  ensureMatchSelected: ReturnType<typeof vi.fn>;
  eventBelongsToMatch: ReturnType<typeof vi.fn>;
  deleteGoal: ReturnType<typeof vi.fn>;
} {
  return {
    ensureMatchSelected: vi.fn().mockResolvedValue(undefined),
    eventBelongsToMatch: vi.fn().mockResolvedValue(true),
    deleteGoal: vi.fn().mockResolvedValue({
      deleted: true, score_a: 2, score_b: 1, round_id: "round-1",
    }),
  };
}

describe("exclusão de gol ao vivo", () => {
  it("não consulta o banco com identificadores incompletos", async () => {
    const db = gateway();
    expect(await deleteLiveGoal("", "match-1", db))
      .toEqual({ success: false, error: "Identificadores inválidos para exclusão do evento." });
    expect(db.ensureMatchSelected).not.toHaveBeenCalled();
  });

  it("confere partida e vínculo do gol antes da RPC", async () => {
    const db = gateway();
    expect(await deleteLiveGoal("event-1", "match-1", db)).toEqual({
      success: true, roundId: "round-1", scoreA: 2, scoreB: 1,
    });
    expect(db.ensureMatchSelected).toHaveBeenCalledWith("match-1");
    expect(db.eventBelongsToMatch).toHaveBeenCalledWith("event-1", "match-1");
    expect(db.deleteGoal).toHaveBeenCalledWith("event-1", "match-1");
    expect(db.ensureMatchSelected.mock.invocationCallOrder[0])
      .toBeLessThan(db.eventBelongsToMatch.mock.invocationCallOrder[0]);
    expect(db.eventBelongsToMatch.mock.invocationCallOrder[0])
      .toBeLessThan(db.deleteGoal.mock.invocationCallOrder[0]);
  });

  it("não exclui gol de outra partida ou pelada", async () => {
    const db = gateway();
    db.eventBelongsToMatch.mockResolvedValueOnce(false);
    expect(await deleteLiveGoal("event-1", "match-1", db))
      .toEqual({ success: false, error: "Gol fora da partida selecionada." });
    expect(db.deleteGoal).not.toHaveBeenCalled();

    db.ensureMatchSelected.mockRejectedValueOnce(new Error("Partida fora da pelada selecionada."));
    await expect(deleteLiveGoal("event-1", "match-1", db))
      .rejects.toThrow("Partida fora da pelada selecionada.");
    expect(db.deleteGoal).not.toHaveBeenCalled();
  });

  it("propaga falha da RPC e preserva campos opcionais do retorno", async () => {
    const db = gateway();
    db.deleteGoal.mockRejectedValueOnce(new Error("Partida encerrada"))
      .mockResolvedValueOnce(null);
    await expect(deleteLiveGoal("event-1", "match-1", db)).rejects.toThrow("Partida encerrada");
    expect(await deleteLiveGoal("event-1", "match-1", db)).toEqual({
      success: true, roundId: undefined, scoreA: undefined, scoreB: undefined,
    });
  });
});
