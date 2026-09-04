import { describe, expect, it } from "vitest";
import { drawTeamsBySpeed, summarizeSpeedTeams, type SpeedDrawPlayer } from "./speed-draw";

// Gerador de seed determinístico para testes reproduzíveis
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("Sorteio por Velocidade", () => {
  it("distribui 6 atletas de cada nível igualmente em 3 times", () => {
    const players: SpeedDrawPlayer[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `3star-${i}`, speedRating: 3 as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `2star-${i}`, speedRating: 2 as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `1star-${i}`, speedRating: 1 as const })),
    ];

    const result = drawTeamsBySpeed({
      players,
      teamCount: 3,
      playersPerTeam: 6,
      random: seededRandom(42),
    });

    expect(result.teams).toHaveLength(3);
    for (const team of result.teams) {
      expect(team).toHaveLength(6);
    }

    // Cada time deve ter exatamente 2 de cada nível
    for (const summary of result.teamSummaries) {
      expect(summary.stars[3]).toBe(2);
      expect(summary.stars[2]).toBe(2);
      expect(summary.stars[1]).toBe(2);
      expect(summary.average).toBe(2);
    }
  });

  it("trata jogadores sem avaliação como 2★", () => {
    const players: SpeedDrawPlayer[] = [
      { id: "rated-3", speedRating: 3 },
      { id: "unrated-1", speedRating: null },
      { id: "unrated-2", speedRating: null },
      { id: "rated-1", speedRating: 1 },
    ];

    const result = drawTeamsBySpeed({
      players,
      teamCount: 2,
      playersPerTeam: 2,
      random: seededRandom(123),
    });

    expect(result.unratedCount).toBe(2);
    expect(result.teams).toHaveLength(2);
    for (const team of result.teams) {
      expect(team).toHaveLength(2);
    }
  });

  it("mantém equilíbrio consistente em 100 execuções", () => {
    const players: SpeedDrawPlayer[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `3star-${i}`, speedRating: 3 as const })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `2star-${i}`, speedRating: 2 as const })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `1star-${i}`, speedRating: 1 as const })),
    ];

    let maxDiffSeen = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const result = drawTeamsBySpeed({
        players,
        teamCount: 3,
        playersPerTeam: 4,
        random: seededRandom(seed),
      });

      const averages = result.teamSummaries.map((s) => s.average);
      const diff = Math.max(...averages) - Math.min(...averages);
      maxDiffSeen = Math.max(maxDiffSeen, diff);
    }

    // A diferença máxima entre times nunca deve ser maior que 1★ na média
    expect(maxDiffSeen).toBeLessThanOrEqual(1);
  });

  it("lida corretamente com poucos jogadores", () => {
    const result = drawTeamsBySpeed({
      players: [{ id: "solo", speedRating: 3 }],
      teamCount: 3,
      playersPerTeam: 2,
      random: seededRandom(99),
    });

    // Sem jogadores suficientes, times ficam vazios
    expect(result.teams).toHaveLength(3);
  });

  it("rejeita valores de velocidade fora de 1-3 pela tipagem", () => {
    // TypeScript já impede valores fora de 1-3 pela tipagem
    // Este teste garante que null é tratado como 2
    const player: SpeedDrawPlayer = { id: "test", speedRating: null };
    const result = drawTeamsBySpeed({
      players: [player, { id: "p2", speedRating: 2 }],
      teamCount: 1,
      playersPerTeam: 2,
      random: seededRandom(1),
    });

    expect(result.teams[0]).toHaveLength(2);
    expect(result.unratedCount).toBe(1);
  });

  it("resume os times efetivamente retornados sem refazer o sorteio", () => {
    const summary = summarizeSpeedTeams(
      [["fast", "middle"], ["slow", "unknown"]],
      new Map([["fast", 3], ["middle", 2], ["slow", 1], ["unknown", null]]),
    );
    expect(summary[0]).toEqual({ stars: { 1: 0, 2: 1, 3: 1 }, average: 2.5 });
    expect(summary[1]).toEqual({ stars: { 1: 1, 2: 1, 3: 0 }, average: 1.5 });
  });
});
