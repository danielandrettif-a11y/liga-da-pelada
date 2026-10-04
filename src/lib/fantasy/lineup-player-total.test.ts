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

  it("usa a apuração oficial do goleiro na rodada finalizada", () => {
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
      { playerId: "goleiro", points: 16.5 },
    ]);
    expect(scores.reduce((total, player) => total + player.points, 0)).toBe(90.75);
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
