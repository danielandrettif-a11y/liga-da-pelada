import { describe, expect, it } from "vitest";
import { formatAwardMonth, formatAwardPerformance, MONTHLY_AWARD_LABELS, parseMonthlyAwardWinners, parseMonthlyAwards, previousMonthStart } from "./monthly-awards";

describe("monthly awards", () => {
  it("normaliza somente categorias conhecidas", () => {
    expect(parseMonthlyAwards([
      { award_type: "bestDefenderMonth", period_start: "2026-09-01", points: "18.5", rounds_played: 3, is_final: true },
      { award_type: "unknown", period_start: "2026-09-01" },
    ])).toEqual([{
      type: "bestDefenderMonth",
      periodStart: "2026-09-01",
      points: 18.5,
      roundsPlayed: 3,
      isFinal: true,
    }]);
  });

  it("formata o mês sem deslocamento de fuso", () => {
    expect(formatAwardMonth("2026-09-01")).toBe("Setembro de 2026");
  });

  it("calcula o começo do mês anterior inclusive na virada do ano", () => {
    expect(previousMonthStart(new Date("2026-01-15T12:00:00Z"))).toBe("2025-12-01");
  });

  it("respeita o mês local de São Paulo na virada em UTC", () => {
    expect(previousMonthStart(new Date("2026-09-01T01:00:00Z"))).toBe("2026-07-01");
  });

  it("normaliza vencedores com a identidade do jogador", () => {
    expect(parseMonthlyAwardWinners([{
      award_type: "bestManagerMonth",
      period_start: "2026-08-01",
      points: "94.2",
      rounds_played: 4,
      is_final: true,
      player_id: "player-1",
      player_name: "Daniel",
      avatar_url: null,
    }])).toEqual([{
      type: "bestManagerMonth",
      periodStart: "2026-08-01",
      points: 94.2,
      roundsPlayed: 4,
      isFinal: true,
      playerId: "player-1",
      playerName: "Daniel",
      avatarUrl: null,
    }]);
  });

  it("apresenta a métrica específica dos novos prêmios", () => {
    const base = { periodStart: "2026-08-01", points: 15, roundsPlayed: 4, isFinal: true };
    expect(formatAwardPerformance({ ...base, type: "bestGoalkeeperMonth", metricValue: 2 })).toBe("2 gols sofridos");
    expect(formatAwardPerformance({ ...base, type: "goldenBootMonth", metricValue: 7 })).toBe("7 gols");
    expect(formatAwardPerformance({ ...base, type: "topAssistMonth", metricValue: 1 })).toBe("1 assistência");
  });

  it("aceita as novas categorias retornadas pelo banco", () => {
    expect(parseMonthlyAwards([{
      award_type: "goldenBootMonth",
      period_start: "2026-08-01",
      points: 22,
      rounds_played: 4,
      metric_value: 9,
      is_final: true,
    }])[0]).toMatchObject({ type: "goldenBootMonth", metricValue: 9 });
  });

  it("exibe as posições dos prêmios por extenso", () => {
    expect(MONTHLY_AWARD_LABELS.bestDefenderMonth).toBe("Melhor Defensor do mês");
    expect(MONTHLY_AWARD_LABELS.bestMidfielderMonth).toBe("Melhor Ala/Meio do mês");
    expect(MONTHLY_AWARD_LABELS.bestAttackerMonth).toBe("Melhor Atacante do mês");
  });
});
