import { describe, expect, it, vi } from "vitest";
import { saveFantasyLineupForLeague, type FantasyLineupGateway } from "./save-lineup";
import type { FantasyLineupSubmission } from "../domain/lineup-submission";

const input: FantasyLineupSubmission = {
  fantasySeasonId: "season-1", roundId: "round-1", playerIds: ["one", "two"],
  slotAssignments: [
    { playerId: "one", slotIndex: 0, slotRole: "ATA" },
    { playerId: "two", slotIndex: 1, slotRole: "GOL" },
  ],
  captainId: "one", scorerId: null, assistId: null, challengeId: null,
  reservePlayerId: null, reserveRole: null,
};
const league = { id: "league-1", playersPerTeam: 5 };

function setup() {
  const gateway = {
    loadRound: vi.fn().mockResolvedValue({ leagueId: "league-1", playersPerTeam: 2 }),
    hasTestSession: vi.fn().mockResolvedValue(false),
    saveTest: vi.fn().mockResolvedValue(null),
    saveRegular: vi.fn().mockResolvedValue({ lineupId: "lineup-1", error: null }),
  } satisfies FantasyLineupGateway;
  return gateway;
}

describe("salvar escalação na pelada", () => {
  it("bloqueia janela fechada, rodada de outra pelada e entrada inválida antes de salvar", async () => {
    const gateway = setup();
    expect(await saveFantasyLineupForLeague({ ...input, roundId: null }, league, gateway)).toMatchObject({ success: false });
    expect(gateway.loadRound).not.toHaveBeenCalled();
    gateway.loadRound.mockResolvedValueOnce({ leagueId: "other", playersPerTeam: 2 });
    expect(await saveFantasyLineupForLeague(input, league, gateway)).toMatchObject({
      success: false, error: "Rodada do Cartola não encontrada nesta pelada.",
    });
    expect(await saveFantasyLineupForLeague({ ...input, captainId: null }, league, gateway)).toMatchObject({ success: false });
    expect(gateway.saveRegular).not.toHaveBeenCalled();
  });

  it("confia no commit atômico da RPC oficial para titulares e reserva", async () => {
    const gateway = setup();
    const withReserve = { ...input, reservePlayerId: "three", reserveRole: "ATA" as const };
    expect(await saveFantasyLineupForLeague(withReserve, league, gateway)).toEqual({ success: true, confirmed: true, warning: undefined });
    expect(gateway.saveRegular).toHaveBeenCalledWith(withReserve, [
      { player_id: "one", slot_index: 0, slot_role: "ATA" },
      { player_id: "two", slot_index: 1, slot_role: "GOL" },
    ]);
    expect(gateway.saveRegular).toHaveBeenCalledOnce();
    gateway.saveRegular.mockResolvedValueOnce({ lineupId: null, error: null });
    expect(await saveFantasyLineupForLeague(withReserve, league, gateway)).toMatchObject({
      success: true, confirmed: false, warning: expect.stringContaining("confira o time"),
    });
  });

  it("usa a RPC de teste sem reserva e propaga os erros das RPCs", async () => {
    const gateway = setup();
    gateway.hasTestSession.mockResolvedValue(true);
    expect(await saveFantasyLineupForLeague(input, league, gateway)).toEqual({ success: true, confirmed: true, warning: undefined });
    expect(gateway.saveTest).toHaveBeenCalledOnce();
    expect(gateway.saveRegular).not.toHaveBeenCalled();
    expect(await saveFantasyLineupForLeague({
      ...input, reservePlayerId: "three", reserveRole: "ATA",
    }, league, gateway)).toMatchObject({ success: false });
    gateway.saveTest.mockResolvedValueOnce("Erro da RPC");
    expect(await saveFantasyLineupForLeague(input, league, gateway)).toEqual({ success: false, error: "Erro da RPC" });
    gateway.hasTestSession.mockResolvedValue(false);
    gateway.saveRegular.mockResolvedValueOnce({ lineupId: null, error: "Mercado fechado" });
    expect(await saveFantasyLineupForLeague(input, league, gateway)).toEqual({ success: false, error: "Mercado fechado" });
  });

  it("não salva se a identificação da rodada de teste falhar", async () => {
    const gateway = setup();
    gateway.hasTestSession.mockRejectedValueOnce(new Error("consulta falhou"));
    await expect(saveFantasyLineupForLeague(input, league, gateway)).rejects.toThrow("consulta falhou");
    expect(gateway.saveTest).not.toHaveBeenCalled();
    expect(gateway.saveRegular).not.toHaveBeenCalled();
  });
});
