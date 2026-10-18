import { describe, expect, it, vi } from "vitest";
import { finishSelectedMatch, type FinishedMatch, type FinishMatchEffects, type FinishMatchGateway } from "./finish-match";

const finishedMatch = {
  id: "match-1", round_id: "round-1", score_a: 2, score_b: 1,
  team_a: { name: "Azul" }, team_b: { name: "Verde" },
};

function setup() {
  const gateway: FinishMatchGateway<{ next: string } | null> & {
    loadCurrent: ReturnType<typeof vi.fn>;
    markFinished: ReturnType<typeof vi.fn>;
    setExitTimes: ReturnType<typeof vi.fn>;
    deactivateParticipants: ReturnType<typeof vi.fn>;
    buildQuickStart: ReturnType<typeof vi.fn>;
  } = {
    loadCurrent: vi.fn().mockResolvedValue({
      roundId: "round-1", status: "live", timerAccumulatedSeconds: 60,
      timerStartedAt: "2026-10-17T10:00:00.000Z", eligibilityElapsedOffsetSeconds: 10,
    }),
    markFinished: vi.fn().mockResolvedValue(finishedMatch),
    setExitTimes: vi.fn().mockResolvedValue(undefined),
    deactivateParticipants: vi.fn().mockResolvedValue(undefined),
    buildQuickStart: vi.fn().mockResolvedValue({ next: "match-2" }),
  };
  const effects: FinishMatchEffects & {
    revalidate: ReturnType<typeof vi.fn>;
    recalculate: ReturnType<typeof vi.fn>;
    notifyAfterResponse: ReturnType<typeof vi.fn>;
  } = {
    revalidate: vi.fn((_matchId: string, _roundId: string) => {}),
    recalculate: vi.fn().mockResolvedValue({ success: true }),
    notifyAfterResponse: vi.fn((_match: FinishedMatch) => {}),
  };
  return { gateway, effects };
}

const nowMs = Date.parse("2026-10-17T10:00:05.000Z");

describe("encerramento da partida", () => {
  it("grava tempos, desativa participantes, recalcula e só então agenda aviso", async () => {
    const { gateway, effects } = setup();
    expect(await finishSelectedMatch("match-1", gateway, effects, nowMs)).toEqual({
      success: true, roundId: "round-1", quickStart: { next: "match-2" },
    });
    expect(gateway.markFinished).toHaveBeenCalledWith("match-1", 65);
    expect(gateway.setExitTimes).toHaveBeenCalledWith("match-1", 75);
    expect(effects.revalidate).toHaveBeenCalledWith("match-1", "round-1");
    expect(effects.recalculate).toHaveBeenCalledWith("round-1");
    expect(effects.notifyAfterResponse).toHaveBeenCalledWith(finishedMatch);
    expect(gateway.setExitTimes.mock.invocationCallOrder[0]).toBeLessThan(effects.revalidate.mock.invocationCallOrder[0]);
    expect(effects.revalidate.mock.invocationCallOrder[0]).toBeLessThan(gateway.deactivateParticipants.mock.invocationCallOrder[0]);
    expect(gateway.deactivateParticipants.mock.invocationCallOrder[0]).toBeLessThan(effects.recalculate.mock.invocationCallOrder[0]);
    expect(effects.recalculate.mock.invocationCallOrder[0]).toBeLessThan(effects.notifyAfterResponse.mock.invocationCallOrder[0]);
    expect(effects.notifyAfterResponse.mock.invocationCallOrder[0]).toBeLessThan(gateway.buildQuickStart.mock.invocationCallOrder[0]);
  });

  it("repara uma partida já encerrada sem notificar de novo", async () => {
    const { gateway, effects } = setup();
    gateway.markFinished.mockResolvedValue(null);
    gateway.loadCurrent.mockResolvedValueOnce({
      roundId: "round-1", status: "live", timerAccumulatedSeconds: 0,
      timerStartedAt: null, eligibilityElapsedOffsetSeconds: 0,
    }).mockResolvedValueOnce({ roundId: "round-1", status: "finished" });
    expect(await finishSelectedMatch("match-1", gateway, effects, nowMs)).toEqual({
      success: true, alreadyFinished: true, roundId: "round-1", quickStart: { next: "match-2" },
    });
    expect(gateway.setExitTimes).toHaveBeenCalledWith("match-1", 0);
    expect(effects.notifyAfterResponse).not.toHaveBeenCalled();
    expect(effects.revalidate).not.toHaveBeenCalled();
    expect(effects.recalculate).toHaveBeenCalledWith("round-1");
  });

  it("não prossegue se a atualização não encerrou a partida", async () => {
    const { gateway, effects } = setup();
    gateway.markFinished.mockResolvedValue(null);
    expect(await finishSelectedMatch("match-1", gateway, effects, nowMs))
      .toEqual({ success: false, error: "Nao foi possivel encerrar a partida." });
    expect(gateway.setExitTimes).not.toHaveBeenCalled();
    expect(effects.recalculate).not.toHaveBeenCalled();
  });

  it("não notifica nem prepara próximo jogo quando o recálculo falha", async () => {
    const { gateway, effects } = setup();
    effects.recalculate.mockResolvedValue({ success: false, error: "falha nos scouts" });
    await expect(finishSelectedMatch("match-1", gateway, effects, nowMs)).rejects.toThrow("falha nos scouts");
    expect(effects.notifyAfterResponse).not.toHaveBeenCalled();
    expect(gateway.buildQuickStart).not.toHaveBeenCalled();
  });

  it("não recalcula nem notifica se a desativação dos participantes falhar", async () => {
    const { gateway, effects } = setup();
    gateway.deactivateParticipants.mockRejectedValue(new Error("falha nos participantes"));
    await expect(finishSelectedMatch("match-1", gateway, effects, nowMs))
      .rejects.toThrow("falha nos participantes");
    expect(effects.recalculate).not.toHaveBeenCalled();
    expect(effects.notifyAfterResponse).not.toHaveBeenCalled();
    expect(gateway.buildQuickStart).not.toHaveBeenCalled();
  });
});
