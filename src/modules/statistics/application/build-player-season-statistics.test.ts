import { describe, expect, it } from "vitest";
import { buildPlayerSeasonStatistics } from "./build-player-season-statistics";

describe("modelo de leitura das estatísticas da temporada", () => {
  it("mescla os totais canônicos e preserva o valor legado para auditoria", () => {
    const [player] = buildPlayerSeasonStatistics(
      [{ id: "player-1", name: "Daniel" }],
      [{ player_id: "player-1", rounds_count: 3, games: 6, points: 20, ranking_points: 27.5 }],
      "official",
    );
    expect(player).toMatchObject({ rounds: 3, games: 6, points: 27.5, legacyPoints: 20 });
  });

  it("retorna zero para jogador ainda sem estatística", () => {
    const [player] = buildPlayerSeasonStatistics([{ id: "new-player" }], [], "official");
    expect(player).toMatchObject({ rounds: 0, games: 0, points: 0, legacyPoints: 0 });
  });
});
