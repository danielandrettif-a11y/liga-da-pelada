import { describe, expect, it } from "vitest";
import { resolveFantasyLineupPlayerTotal, shouldUseFantasyLiveRanking } from "./lineup-player-total";

describe("total dos jogadores escalados", () => {
  it("soma os seis totais exibidos no campo, incluindo o capitão", () => {
    expect(resolveFantasyLineupPlayerTotal({
      projectedPlayers: [
        { totalPoints: 37.5 },
        { totalPoints: 36.5 },
        { totalPoints: 78.8 },
        { totalPoints: 43 },
        { totalPoints: 22.5 },
        { totalPoints: 16.5 },
      ],
    })).toBe(234.8);
  });

  it("prefere os atletas apurados quando o agregado persistido está antigo", () => {
    expect(resolveFantasyLineupPlayerTotal({
      storedPlayers: [{ total_points: 78.8 }, { total_points: 156 }],
      storedPlayerPoints: 200.8,
    })).toBe(234.8);
  });

  it("usa o agregado apenas quando não existem atletas detalhados", () => {
    expect(resolveFantasyLineupPlayerTotal({ storedPlayerPoints: 200.8 })).toBe(200.8);
  });

  it("não substitui o fechamento salvo por uma reconstrução ao vivo após a rodada terminar", () => {
    expect(shouldUseFantasyLiveRanking({
      isLive: false,
      projectionRoundId: "round-6",
      requestedRoundId: "round-6",
    })).toBe(false);
  });

  it("usa a projeção somente durante a própria rodada em andamento", () => {
    expect(shouldUseFantasyLiveRanking({
      isLive: true,
      projectionRoundId: "round-6",
      requestedRoundId: "round-6",
    })).toBe(true);
    expect(shouldUseFantasyLiveRanking({
      isLive: true,
      projectionRoundId: "round-7",
      requestedRoundId: "round-6",
    })).toBe(false);
  });
});
