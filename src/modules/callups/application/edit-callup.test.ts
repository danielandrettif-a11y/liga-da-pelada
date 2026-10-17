import { describe, expect, it, vi } from "vitest";
import { editCallup, type CallupEditingGateway } from "./edit-callup";
import { DUPLICATE_CALLUP_DATE_ERROR } from "./open-callup";
import type { EditCallupRequest } from "../domain/edit-callup";

const request: EditCallupRequest = {
  callupId: "callup-1", date: "2026-10-17", startTime: "08:00", stadiumId: null, roundType: "official",
};

function gateway(): CallupEditingGateway & {
  existsOnDate: ReturnType<typeof vi.fn>;
  loadStadium: ReturnType<typeof vi.fn>;
  updateCallup: ReturnType<typeof vi.fn>;
  loadLinkedRoundId: ReturnType<typeof vi.fn>;
  syncDraftRound: ReturnType<typeof vi.fn>;
} {
  return {
    existsOnDate: vi.fn().mockResolvedValue(false),
    loadStadium: vi.fn().mockResolvedValue({ name: "Campo Novo", mapUrl: "https://example.com" }),
    loadLeagueVenue: vi.fn().mockResolvedValue({ name: "Campo BQ", mapUrl: null }),
    updateCallup: vi.fn().mockResolvedValue(null),
    loadLinkedRoundId: vi.fn().mockResolvedValue(null),
    syncDraftRound: vi.fn().mockResolvedValue(undefined),
  };
}

describe("caso de uso de edição da convocação", () => {
  it("bloqueia outra convocação no mesmo dia da mesma pelada", async () => {
    const store = gateway();
    store.existsOnDate.mockResolvedValue(true);
    expect(await editCallup(request, "league-1", store)).toEqual({ success: false, error: DUPLICATE_CALLUP_DATE_ERROR });
    expect(store.existsOnDate).toHaveBeenCalledWith("league-1", request.date, "callup-1");
    expect(store.updateCallup).not.toHaveBeenCalled();
  });

  it("retorna erro de consulta à data sem gravar", async () => {
    const store = gateway();
    store.existsOnDate.mockRejectedValue(new Error("falha na consulta"));
    expect(await editCallup(request, "league-1", store)).toEqual({ success: false, error: "falha na consulta" });
    expect(store.updateCallup).not.toHaveBeenCalled();
  });

  it("impede estádio que não pertence à pelada", async () => {
    const store = gateway();
    store.loadStadium.mockResolvedValue(null);
    expect(await editCallup({ ...request, stadiumId: "other-stadium" }, "league-1", store))
      .toEqual({ success: false, error: "Estádio fora da pelada selecionada." });
    expect(store.loadStadium).toHaveBeenCalledWith("other-stadium", "league-1");
    expect(store.updateCallup).not.toHaveBeenCalled();
  });

  it("atualiza convocação e sincroniza somente rodada vinculada em rascunho", async () => {
    const store = gateway();
    store.loadLinkedRoundId.mockResolvedValue("round-1");
    expect(await editCallup({ ...request, stadiumId: "stadium-1" }, "league-1", store))
      .toEqual({ success: true });
    const record = expect.objectContaining({ leagueId: "league-1", callupId: "callup-1", stadiumName: "Campo Novo" });
    expect(store.updateCallup).toHaveBeenCalledWith(record);
    expect(store.loadLinkedRoundId).toHaveBeenCalledWith("callup-1", "league-1");
    expect(store.syncDraftRound).toHaveBeenCalledWith("round-1", record);
  });

  it("usa estádio padrão quando nenhum é escolhido e não sincroniza rodada ausente", async () => {
    const store = gateway();
    expect(await editCallup(request, "league-1", store)).toEqual({ success: true });
    expect(store.updateCallup).toHaveBeenCalledWith(expect.objectContaining({ stadiumName: "Campo BQ", stadiumMapUrl: null }));
    expect(store.syncDraftRound).not.toHaveBeenCalled();
  });

  it("mapeia violação de unicidade durante a gravação", async () => {
    const store = gateway();
    store.updateCallup.mockResolvedValue({ code: "23505", message: "duplicate" });
    expect(await editCallup(request, "league-1", store)).toEqual({ success: false, error: DUPLICATE_CALLUP_DATE_ERROR });
    expect(store.loadLinkedRoundId).not.toHaveBeenCalled();
  });
});
