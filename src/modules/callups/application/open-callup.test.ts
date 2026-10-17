import { describe, expect, it, vi } from "vitest";
import { DUPLICATE_CALLUP_DATE_ERROR, openCallupWithPrelist, type CallupOpeningGateway } from "./open-callup";
import type { OpenCallupRequest } from "../domain/open-callup";

const request: OpenCallupRequest = {
  date: "2026-10-17", startTime: "08:00", stadiumId: null,
  roundType: "official", requestedPlayersPerTeam: "7", requestedTeamsPerRound: "3",
};

function gateway(): CallupOpeningGateway & {
  existsOnDate: ReturnType<typeof vi.fn>;
  loadStadium: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    existsOnDate: vi.fn().mockResolvedValue(false),
    loadLeagueDefaults: vi.fn().mockResolvedValue({
      playersPerTeam: 7, teamsPerRound: 3, stadiumName: "Campo BQ", stadiumMapUrl: null,
    }),
    loadStadium: vi.fn().mockResolvedValue({ name: "Campo Novo", mapUrl: "https://example.com" }),
    insert: vi.fn().mockResolvedValue({ status: "created", id: "callup-1" }),
    remove: vi.fn().mockResolvedValue(null),
  };
}

describe("abertura de convocação com pré-lista", () => {
  it("barra a mesma data apenas na pelada selecionada", async () => {
    const store = gateway();
    store.existsOnDate.mockResolvedValue(true);
    const prepare = vi.fn();
    expect(await openCallupWithPrelist(request, "league-1", store, prepare))
      .toEqual({ success: false, error: DUPLICATE_CALLUP_DATE_ERROR });
    expect(store.existsOnDate).toHaveBeenCalledWith("league-1", request.date);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("recusa estádio não encontrado na pelada", async () => {
    const store = gateway();
    store.loadStadium.mockResolvedValue(null);
    expect(await openCallupWithPrelist({ ...request, stadiumId: "other-stadium" }, "league-1", store, vi.fn()))
      .toEqual({ success: false, error: "Estádio fora da pelada selecionada." });
    expect(store.loadStadium).toHaveBeenCalledWith("other-stadium", "league-1");
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("cria a convocação e a pré-lista antes de informar sucesso", async () => {
    const store = gateway();
    const prepare = vi.fn().mockResolvedValue({ success: true, roundId: "round-1" });
    expect(await openCallupWithPrelist(request, "league-1", store, prepare))
      .toEqual({ success: true, id: "callup-1", roundId: "round-1" });
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({
      leagueId: "league-1", capacity: 21, playersPerTeam: 7, teamsPerRound: 3,
      stadiumName: "Campo BQ", roundType: "official",
    }));
    expect(prepare).toHaveBeenCalledWith("callup-1");
  });

  it("desfaz a abertura se a pré-lista falhar", async () => {
    const store = gateway();
    const prepare = vi.fn().mockResolvedValue({ success: false, error: "falha na pré-lista" });
    expect(await openCallupWithPrelist(request, "league-1", store, prepare))
      .toEqual({ success: false, error: "falha na pré-lista" });
    expect(store.remove).toHaveBeenCalledWith("callup-1", "league-1");
  });

  it("avisa quando nem a pré-lista nem a reversão funcionam", async () => {
    const store = gateway();
    store.remove.mockResolvedValue("falha ao remover");
    const result = await openCallupWithPrelist(request, "league-1", store, vi.fn().mockRejectedValue(new Error("prelist failed")));
    expect(result).toEqual({
      success: false,
      error: "A convocação foi aberta, mas a pré-lista falhou: prelist failed. Feche a convocação antes de tentar novamente.",
    });
  });

  it("trata a violação da restrição única mesmo após a checagem inicial", async () => {
    const store = gateway();
    store.insert.mockResolvedValue({ status: "duplicate" });
    expect(await openCallupWithPrelist(request, "league-1", store, vi.fn()))
      .toEqual({ success: false, error: DUPLICATE_CALLUP_DATE_ERROR });
  });
});
