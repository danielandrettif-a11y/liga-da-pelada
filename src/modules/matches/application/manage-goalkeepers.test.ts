import { describe, expect, it, vi } from "vitest";
import { chooseFixedGoalkeeper, switchMatchGoalkeeper, type GoalkeeperGateway } from "./manage-goalkeepers";

function gateway(): GoalkeeperGateway & {
  findRoundTeam: ReturnType<typeof vi.fn>;
  isTeamPlayer: ReturnType<typeof vi.fn>;
  setFixedGoalkeeper: ReturnType<typeof vi.fn>;
  loadMatch: ReturnType<typeof vi.fn>;
  changeMatchGoalkeeper: ReturnType<typeof vi.fn>;
} {
  return {
    findRoundTeam: vi.fn().mockResolvedValue({ team: { roundId: "round-1" }, error: null }),
    isTeamPlayer: vi.fn().mockResolvedValue(true),
    setFixedGoalkeeper: vi.fn().mockResolvedValue(undefined),
    loadMatch: vi.fn().mockResolvedValue({ roundId: "round-1", status: "live", teamAId: "team-1", teamBId: "team-2" }),
    changeMatchGoalkeeper: vi.fn().mockResolvedValue({ goalkeeper_player_id: "player-1" }),
  };
}

describe("goleiro fixo do time", () => {
  const input = { roundId: "round-1", teamId: "team-1", playerId: "player-1", leagueId: "league-1" };

  it("rejeita time inválido sem consultar o banco", async () => {
    const db = gateway();
    expect(await chooseFixedGoalkeeper({ ...input, leagueId: null }, db))
      .toEqual({ success: false, error: "Time inválido." });
    expect(db.findRoundTeam).not.toHaveBeenCalled();
  });

  it("exige time da pelada e jogador desse time", async () => {
    const db = gateway();
    db.findRoundTeam.mockResolvedValueOnce({ team: null, error: null });
    expect(await chooseFixedGoalkeeper(input, db))
      .toEqual({ success: false, error: "Time fora da pelada selecionada." });
    db.isTeamPlayer.mockResolvedValueOnce(false);
    expect(await chooseFixedGoalkeeper(input, db))
      .toEqual({ success: false, error: "Escolha um jogador deste time para ser o goleiro fixo." });
    expect(db.setFixedGoalkeeper).not.toHaveBeenCalled();
  });

  it("grava goleiro do time e permite remover a fixação", async () => {
    const db = gateway();
    expect(await chooseFixedGoalkeeper(input, db)).toEqual({ success: true, roundId: "round-1" });
    expect(db.findRoundTeam).toHaveBeenCalledWith("round-1", "team-1", "league-1");
    expect(db.isTeamPlayer).toHaveBeenCalledWith("team-1", "player-1");
    expect(db.setFixedGoalkeeper).toHaveBeenCalledWith("team-1", "player-1");
    expect(await chooseFixedGoalkeeper({ ...input, playerId: null }, db))
      .toEqual({ success: true, roundId: "round-1" });
    expect(db.setFixedGoalkeeper).toHaveBeenCalledWith("team-1", null);
    expect(db.isTeamPlayer).toHaveBeenCalledTimes(1);
  });
});

describe("troca do goleiro durante a partida", () => {
  const input = { matchId: "match-1", teamId: "team-1", playerId: "player-1", elapsedSeconds: 12.8 };

  it("valida entrada, partida ao vivo e time participante", async () => {
    const db = gateway();
    expect(await switchMatchGoalkeeper({ ...input, playerId: "" }, db))
      .toEqual({ success: false, error: "Escolha um jogador para entrar no gol." });
    expect(db.loadMatch).not.toHaveBeenCalled();
    db.loadMatch.mockResolvedValueOnce({ roundId: "round-1", status: "finished", teamAId: "team-1", teamBId: "team-2" });
    expect(await switchMatchGoalkeeper(input, db))
      .toEqual({ success: false, error: "A partida não está em andamento." });
    expect(await switchMatchGoalkeeper({ ...input, teamId: "team-3" }, db))
      .toEqual({ success: false, error: "Time fora desta partida." });
    expect(db.changeMatchGoalkeeper).not.toHaveBeenCalled();
  });

  it("troca o goleiro pela RPC e mantém o retorno para a tela", async () => {
    const db = gateway();
    expect(await switchMatchGoalkeeper(input, db)).toEqual({
      success: true, roundId: "round-1", data: { goalkeeper_player_id: "player-1" },
    });
    expect(db.changeMatchGoalkeeper).toHaveBeenCalledWith("match-1", "team-1", "player-1", 12.8);
    expect(db.loadMatch.mock.invocationCallOrder[0]).toBeLessThan(db.changeMatchGoalkeeper.mock.invocationCallOrder[0]);
  });
});
