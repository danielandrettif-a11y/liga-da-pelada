import { describe, expect, it, vi } from "vitest";
import { substitutePlayerInMatch, type MatchSubstitutionGateway } from "./substitute-match-player";

function gateway(): MatchSubstitutionGateway & {
  loadSelectedMatchRoundId: ReturnType<typeof vi.fn>;
  loadIncomingContext: ReturnType<typeof vi.fn>;
  substitute: ReturnType<typeof vi.fn>;
} {
  return {
    loadSelectedMatchRoundId: vi.fn().mockResolvedValue("round-1"),
    loadIncomingContext: vi.fn().mockResolvedValue({
      found: true, formationMode: "automatic", attendanceStatus: "present",
    }),
    substitute: vi.fn().mockResolvedValue("substitution-1"),
  };
}

const input = {
  match_id: "match-1", team_id: "team-1", player_out_id: "player-1",
  player_in_id: "player-2", reason: "injury" as const, mark_injured: true,
};

describe("substituição na partida", () => {
  it("não consulta o banco com entrada incompleta", async () => {
    const db = gateway();
    expect(await substitutePlayerInMatch({ ...input, player_out_id: "" }, db))
      .toEqual({ success: false, error: "Preencha os dados da substituicao." });
    expect(db.loadSelectedMatchRoundId).not.toHaveBeenCalled();
  });

  it("verifica pelada e presença antes de chamar a RPC", async () => {
    const db = gateway();
    expect(await substitutePlayerInMatch(input, db)).toEqual({
      success: true, substitutionId: "substitution-1", roundId: "round-1",
    });
    expect(db.loadSelectedMatchRoundId).toHaveBeenCalledWith("match-1");
    expect(db.loadIncomingContext).toHaveBeenCalledWith("match-1", "player-2");
    expect(db.substitute).toHaveBeenCalledWith(input);
    expect(db.loadSelectedMatchRoundId).toHaveBeenCalledTimes(1);
    expect(db.loadSelectedMatchRoundId.mock.invocationCallOrder[0]).toBeLessThan(db.loadIncomingContext.mock.invocationCallOrder[0]);
    expect(db.loadIncomingContext.mock.invocationCallOrder[0]).toBeLessThan(db.substitute.mock.invocationCallOrder[0]);
  });

  it("permite saída sem entrada de substituto sem consultar presença", async () => {
    const db = gateway();
    expect(await substitutePlayerInMatch({ ...input, player_in_id: undefined }, db))
      .toMatchObject({ success: true, roundId: "round-1" });
    expect(db.loadIncomingContext).not.toHaveBeenCalled();
  });

  it("não chama a RPC se o substituto não está na rodada ou não está presente", async () => {
    const db = gateway();
    db.loadIncomingContext.mockResolvedValueOnce({ found: false, formationMode: null, attendanceStatus: null })
      .mockResolvedValueOnce({ found: true, formationMode: "automatic", attendanceStatus: "absent" });
    expect(await substitutePlayerInMatch(input, db))
      .toEqual({ success: false, error: "Substituto nao encontrado nesta rodada." });
    expect(await substitutePlayerInMatch(input, db))
      .toEqual({ success: false, error: "O substituto ainda nao foi marcado como presente." });
    expect(db.substitute).not.toHaveBeenCalled();
  });

  it("não grava fora da pelada selecionada e propaga falhas da RPC", async () => {
    const db = gateway();
    db.loadSelectedMatchRoundId.mockRejectedValueOnce(new Error("Partida fora da pelada selecionada."));
    await expect(substitutePlayerInMatch(input, db)).rejects.toThrow("Partida fora da pelada selecionada.");
    expect(db.substitute).not.toHaveBeenCalled();
    db.substitute.mockRejectedValueOnce(new Error("jogador já saiu"));
    await expect(substitutePlayerInMatch(input, db)).rejects.toThrow("jogador já saiu");
  });
});
