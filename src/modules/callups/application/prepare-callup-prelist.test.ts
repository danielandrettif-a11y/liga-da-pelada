import { describe, expect, it, vi } from "vitest";
import { prepareCallupPrelist, type PrelistGateway } from "./prepare-callup-prelist";
import type { PrelistCallup } from "../domain/callup-prelist";

const callup: PrelistCallup = {
  id: "callup-1", date: "2026-10-17", startTime: "08:00", stadiumId: null,
  stadiumName: "Campo BQ", stadiumMapUrl: null, roundType: "official", status: "open", roundId: null,
  entries: [{ playerId: "player-1", status: "confirmed" }, { playerId: "player-2", status: "waitlist" }],
};

const league = { id: "league-1", featureTier: "complete" as const };

function gateway(row: PrelistCallup | null = callup): PrelistGateway & {
  loadCallup: ReturnType<typeof vi.fn>;
  loadLinkedRound: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  return {
    loadCallup: vi.fn().mockResolvedValue({ callup: row, error: null }),
    loadLinkedRound: vi.fn().mockResolvedValue({ round: { id: "round-1", status: "draft", preparationStage: "prelist" }, error: null }),
    save: vi.fn().mockResolvedValue({ roundId: "round-1", error: null }),
  };
}

describe("preparação da pré-lista", () => {
  it("reutiliza uma pré-lista existente sem salvar nem reagendar", async () => {
    const store = gateway({ ...callup, roundId: "round-1" });
    const schedule = vi.fn();
    expect(await prepareCallupPrelist("callup-1", league, store, schedule))
      .toEqual({ success: true, roundId: "round-1", created: false });
    expect(store.loadCallup).toHaveBeenCalledWith("callup-1", "league-1");
    expect(store.save).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("não recria uma rodada já convertida", async () => {
    const store = gateway({ ...callup, roundId: "round-1" });
    store.loadLinkedRound.mockResolvedValue({ round: { id: "round-1", status: "finished", preparationStage: null }, error: null });
    expect(await prepareCallupPrelist("callup-1", league, store, vi.fn()))
      .toEqual({ success: false, error: "Esta convocacao ja foi convertida em rodada." });
  });

  it("recusa convocação fechada", async () => {
    const store = gateway({ ...callup, status: "closed" });
    expect(await prepareCallupPrelist("callup-1", league, store, vi.fn()))
      .toEqual({ success: false, error: "A convocacao precisa estar aberta para criar a pre-lista." });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("salva confirmados e agenda Cartola apenas depois do RPC", async () => {
    const store = gateway();
    const schedule = vi.fn().mockResolvedValue(undefined);
    expect(await prepareCallupPrelist("callup-1", league, store, schedule))
      .toEqual({ success: true, roundId: "round-1", created: true });
    expect(store.save).toHaveBeenCalledWith({
      leagueId: "league-1", callup, confirmedPlayerIds: ["player-1"],
    });
    expect(schedule).toHaveBeenCalledWith({ roundId: "round-1", date: callup.date, startTime: "08:00" });
  });

  it("não agenda amistoso nem pelada básica", async () => {
    const schedule = vi.fn();
    await prepareCallupPrelist("callup-1", league, gateway({ ...callup, roundType: "friendly" }), schedule);
    await prepareCallupPrelist("callup-1", { ...league, featureTier: "basic" }, gateway(), schedule);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("mantém a pré-lista criada quando o serviço de lembretes falha", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await prepareCallupPrelist("callup-1", league, gateway(), vi.fn().mockRejectedValue(new Error("scheduler"))))
        .toEqual({ success: true, roundId: "round-1", created: true });
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it("propaga a falha do RPC sem agendar lembretes", async () => {
    const store = gateway();
    store.save.mockResolvedValue({ roundId: null, error: "falha no banco" });
    const schedule = vi.fn();
    expect(await prepareCallupPrelist("callup-1", league, store, schedule))
      .toEqual({ success: false, error: "falha no banco" });
    expect(schedule).not.toHaveBeenCalled();
  });
});
