import { describe, expect, it } from "vitest";
import {
  resolveFantasyBulletinTotal,
  resolveFantasyFinishedPlayerScores,
  resolveFantasyLineupPlayerTotal,
  shouldUseFantasyRoundProjection,
} from "./lineup-player-total";

describe("total dos jogadores escalados", () => {
  it("soma os seis totais exibidos no campo, incluindo o capitão", () => {
    expect(resolveFantasyLineupPlayerTotal({
      projectedPlayers: [
        { totalPoints: 37.5 },
        { totalPoints: 36.5 },
        { totalPoints: 74.25 },
        { totalPoints: 43 },
        { totalPoints: 22.5 },
        { totalPoints: 16.5 },
      ],
    })).toBe(230.25);
  });

  it("prefere os atletas apurados quando o agregado persistido está antigo", () => {
    expect(resolveFantasyLineupPlayerTotal({
      storedPlayers: [{ total_points: 74.25 }, { total_points: 156 }],
      storedPlayerPoints: 200.8,
    })).toBe(230.25);
  });

  it("usa o agregado apenas quando não existem atletas detalhados", () => {
    expect(resolveFantasyLineupPlayerTotal({ storedPlayerPoints: 200.8 })).toBe(200.8);
  });

  it("soma o bônus da carta ao número principal do boletim", () => {
    const total = resolveFantasyBulletinTotal({ playerPoints: 217.25, cardPoints: 3 });
    expect(total).toBe(220.25);
    expect(total.toFixed(1)).toBe("220.3");
  });

  it("usa a reconstrução oficial também para o goleiro na rodada finalizada", () => {
    const scores = resolveFantasyFinishedPlayerScores({
      projectedPlayers: [
        { playerId: "ala", totalPoints: 74.25 },
        { playerId: "goleiro", totalPoints: 0 },
      ],
      storedPlayers: [
        { player_id: "ala", slot_role: "ALA", total_points: 78.75 },
        { player_id: "goleiro", slot_role: "GOL", total_points: 16.5 },
      ],
    });

    expect(scores).toEqual([
      { playerId: "ala", points: 74.25 },
      { playerId: "goleiro", points: 0 },
    ]);
    expect(scores.reduce((total, player) => total + player.points, 0)).toBe(74.25);
  });

  it("corrige o total do ranking finalizado sem trocar os pontos dos jogadores de linha", () => {
    const scores = resolveFantasyFinishedPlayerScores({
      projectedPlayers: [
        { playerId: "ata", totalPoints: 33.5 },
        { playerId: "ala-1", totalPoints: 31.5 },
        { playerId: "ala-2", totalPoints: 74.25 },
        { playerId: "def-1", totalPoints: 39 },
        { playerId: "def-2", totalPoints: 22.5 },
        { playerId: "gol", totalPoints: 0 },
      ],
      storedPlayers: [
        { player_id: "ata", slot_role: "ATA", total_points: 37.5 },
        { player_id: "ala-1", slot_role: "MEI", total_points: 36.5 },
        { player_id: "ala-2", slot_role: "MEI", total_points: 78.75 },
        { player_id: "def-1", slot_role: "DEF", total_points: 43 },
        { player_id: "def-2", slot_role: "DEF", total_points: 22.5 },
        { player_id: "gol", slot_role: "GOL", total_points: 16.5 },
      ],
    });

    expect(scores.reduce((total, player) => total + player.points, 0)).toBe(200.75);
  });

  it("mantém o valor persistido somente quando um atleta não veio na reconstrução", () => {
    const scores = resolveFantasyFinishedPlayerScores({
      projectedPlayers: [{ playerId: "ata", totalPoints: 12 }],
      storedPlayers: [
        { player_id: "ata", slot_role: "ATA", total_points: 9 },
        { player_id: "sem-projecao", slot_role: "DEF", total_points: 4 },
      ],
    });

    expect(scores).toEqual([
      { playerId: "ata", points: 12 },
      { playerId: "sem-projecao", points: 4 },
    ]);
  });

  it("reconstrói também a rodada finalizada quando o alvo é o mesmo", () => {
    expect(shouldUseFantasyRoundProjection({
      projectionRoundId: "round-6",
      targetRoundId: "round-6",
    })).toBe(true);
  });

  it("nunca mistura a reconstrução de uma rodada com outra", () => {
    expect(shouldUseFantasyRoundProjection({
      projectionRoundId: "round-6",
      targetRoundId: "round-6",
    })).toBe(true);
    expect(shouldUseFantasyRoundProjection({
      projectionRoundId: "round-7",
      targetRoundId: "round-6",
    })).toBe(false);
  });
});
