import { describe, expect, it } from "vitest";
import {
  resolveFantasyBulletinTotal,
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
