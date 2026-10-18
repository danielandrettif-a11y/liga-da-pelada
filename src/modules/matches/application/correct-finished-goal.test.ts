import { describe, expect, it, vi } from "vitest";
import {
  correctFinishedGoalInMatch,
  type FinishedGoalCorrectionEffects,
  type FinishedGoalCorrectionGateway,
} from "./correct-finished-goal";

function setup() {
  const gateway = {
    loadEventScope: vi.fn().mockResolvedValue({ matchId: "match-1", roundId: "round-1" }),
    loadMatchScope: vi.fn().mockResolvedValue({ matchId: "match-1", roundId: "round-1" }),
    removeGoal: vi.fn().mockResolvedValue({ match_id: "match-1", round_id: "round-1" }),
    editGoal: vi.fn().mockResolvedValue({ match_id: "match-1", round_id: "round-1" }),
    addGoal: vi.fn().mockResolvedValue({ match_id: "match-1", round_id: "round-1" }),
    hasFantasyRound: vi.fn().mockResolvedValue(true),
    reprocessFantasy: vi.fn().mockResolvedValue(undefined),
  } satisfies FinishedGoalCorrectionGateway;
  const effects = {
    recalculateStats: vi.fn().mockResolvedValue({ success: true }),
    refreshOverall: vi.fn().mockResolvedValue(undefined),
  } satisfies FinishedGoalCorrectionEffects;
  return { gateway, effects };
}

const remove = { kind: "remove" as const, eventId: "event-1", confirmation: "EDITAR" };
const edit = {
  kind: "edit" as const, eventId: "event-1", playerId: "player-1",
  assistPlayerId: "player-2", confirmation: "EDITAR",
};
const add = {
  kind: "add" as const, matchId: "match-1", teamId: "team-1", playerId: "player-1",
  assistPlayerId: null, confirmation: "EDITAR",
};

describe("correção de gol finalizado", () => {
  it("valida antes de consultar e não processa sem mutação", async () => {
    const { gateway, effects } = setup();
    expect(await correctFinishedGoalInMatch({ ...edit, confirmation: "" }, gateway, effects))
      .toEqual({ success: false, error: "Digite EDITAR para liberar correções em partidas finalizadas." });
    expect(gateway.loadEventScope).not.toHaveBeenCalled();
    gateway.removeGoal.mockRejectedValueOnce(new Error("RPC falhou"));
    await expect(correctFinishedGoalInMatch(remove, gateway, effects)).rejects.toThrow("RPC falhou");
    expect(effects.recalculateStats).not.toHaveBeenCalled();
  });

  it("remove, edita e adiciona usando a partida da pelada selecionada", async () => {
    const { gateway, effects } = setup();
    for (const input of [remove, edit, add]) {
      expect(await correctFinishedGoalInMatch(input, gateway, effects)).toEqual({
        success: true, matchId: "match-1", roundId: "round-1", warning: undefined,
      });
    }
    expect(gateway.loadEventScope).toHaveBeenCalledTimes(2);
    expect(gateway.loadMatchScope).toHaveBeenCalledWith("match-1");
    expect(gateway.removeGoal).toHaveBeenCalledWith("event-1");
    expect(gateway.editGoal).toHaveBeenCalledWith("event-1", "player-1", "player-2");
    expect(gateway.addGoal).toHaveBeenCalledWith("match-1", "team-1", "player-1", null);
    expect(effects.recalculateStats).toHaveBeenCalledTimes(3);
    expect(gateway.reprocessFantasy).toHaveBeenCalledTimes(3);
    expect(effects.refreshOverall).toHaveBeenCalledTimes(3);
  });

  it("usa o alvo retornado pela RPC e pula Cartola quando não há rodada dele", async () => {
    const { gateway, effects } = setup();
    gateway.removeGoal.mockResolvedValueOnce({ match_id: "match-2", round_id: "round-2" });
    gateway.hasFantasyRound.mockResolvedValueOnce(false);
    expect(await correctFinishedGoalInMatch(remove, gateway, effects)).toMatchObject({
      success: true, matchId: "match-2", roundId: "round-2",
    });
    expect(effects.recalculateStats).toHaveBeenCalledWith("round-2");
    expect(gateway.reprocessFantasy).not.toHaveBeenCalled();
    expect(effects.refreshOverall).toHaveBeenCalledWith("round-2");
  });

  it("reprocessa o alvo consultado quando a RPC não devolve os identificadores", async () => {
    const { gateway, effects } = setup();
    gateway.removeGoal.mockResolvedValueOnce(null);
    expect(await correctFinishedGoalInMatch(remove, gateway, effects)).toMatchObject({
      success: true, matchId: "match-1", roundId: "round-1",
    });
    expect(effects.recalculateStats).toHaveBeenCalledWith("round-1");
  });

  it("não reporta falha da correção quando o recálculo posterior falha", async () => {
    const { gateway, effects } = setup();
    effects.recalculateStats.mockResolvedValueOnce({ success: false, error: "Ranking pendente" });
    expect(await correctFinishedGoalInMatch(remove, gateway, effects)).toEqual({
      success: true, matchId: "match-1", roundId: "round-1", warning: "Ranking pendente",
    });
    expect(gateway.hasFantasyRound).not.toHaveBeenCalled();
  });

  it("avisa sobre Cartola/Overall após a RPC sem pedir repetição do gol", async () => {
    const { gateway, effects } = setup();
    gateway.reprocessFantasy.mockRejectedValueOnce(new Error("Cartola pendente"));
    expect(await correctFinishedGoalInMatch(edit, gateway, effects)).toMatchObject({
      success: true, warning: "Cartola pendente",
    });
    effects.refreshOverall.mockRejectedValueOnce(new Error("Overall pendente"));
    expect(await correctFinishedGoalInMatch(add, gateway, effects)).toMatchObject({
      success: true, warning: "Overall pendente",
    });
  });

  it("avisa quando não consegue consultar a rodada do Cartola após a RPC", async () => {
    const { gateway, effects } = setup();
    gateway.hasFantasyRound.mockRejectedValueOnce(new Error("Consulta do Cartola falhou"));
    expect(await correctFinishedGoalInMatch(remove, gateway, effects)).toMatchObject({
      success: true, warning: "Consulta do Cartola falhou",
    });
    expect(effects.refreshOverall).not.toHaveBeenCalled();
  });

  it("não roda mutação fora da pelada selecionada", async () => {
    const { gateway, effects } = setup();
    gateway.loadEventScope.mockRejectedValueOnce(new Error("Partida fora da pelada selecionada."));
    await expect(correctFinishedGoalInMatch(remove, gateway, effects))
      .rejects.toThrow("Partida fora da pelada selecionada.");
    expect(gateway.removeGoal).not.toHaveBeenCalled();
  });
});
