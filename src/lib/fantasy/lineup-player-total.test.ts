import { describe, expect, it } from "vitest";
import { resolveFantasyLineupPlayerTotal } from "./lineup-player-total";

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
});
