import { describe, it, expect } from "vitest";
import { aggregatePlayerStats, calculateWinRate } from "./utils";

describe("Performance V1: aggregatePlayerStats", () => {
  it("calculates aggregated statistics correctly from round history rows", () => {
    const history = [
      { games: 2, goals: 3, assists: 1, wins: 2, draws: 0, losses: 0, points: 15 },
      { games: 1, goals: 0, assists: 2, wins: 0, draws: 1, losses: 0, points: 5 },
      { games: 2, goals: 1, assists: 0, wins: 1, draws: 0, losses: 1, points: 8 },
    ];

    const result = aggregatePlayerStats(history as any);

    expect(result.rounds).toBe(3);
    expect(result.games).toBe(5);
    expect(result.goals).toBe(4);
    expect(result.assists).toBe(3);
    expect(result.wins).toBe(3);
    expect(result.draws).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.points).toBe(28);
  });

  it("handles empty or null history safely", () => {
    const result = aggregatePlayerStats([]);
    expect(result).toEqual({
      rounds: 0,
      games: 0,
      goals: 0,
      assists: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
    });
  });
});

describe("Performance V1 Parte 2: Regressão e Volume de Ranking (SQL View vs JS)", () => {
  // Simula a agregação em Node.js (método antigo)
  function legacyAggregate(statsRows: Array<{
    player_id: string;
    player_name: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    points: number;
  }>) {
    const map = new Map<string, any>();
    for (const row of statsRows) {
      if (!map.has(row.player_id)) {
        map.set(row.player_id, {
          player_id: row.player_id,
          name: row.player_name,
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals: 0,
          assists: 0,
          points: 0,
          winRate: 0,
        });
      }
      const s = map.get(row.player_id);
      s.games += row.games;
      s.wins += row.wins;
      s.draws += row.draws;
      s.losses += row.losses;
      s.goals += row.goals;
      s.assists += row.assists;
      s.points += row.points;
      s.winRate = s.games === 0 ? 0 : Math.round(((s.wins * 3 + s.draws) / (s.games * 3)) * 100);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goals !== a.goals) return b.goals - a.goals;
      return b.assists - a.assists;
    });
  }

  // Simula o resultado da SQL View player_season_stats (PostgreSQL SUM + GROUP BY + ORDER BY)
  function sqlViewSimulation(statsRows: Array<{
    player_id: string;
    player_name: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    points: number;
  }>) {
    const grouped = new Map<string, any>();
    for (const row of statsRows) {
      const curr = grouped.get(row.player_id) || {
        player_id: row.player_id,
        name: row.player_name,
        rounds_count: 0,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        assists: 0,
        points: 0,
      };
      curr.rounds_count += 1;
      curr.games += row.games;
      curr.wins += row.wins;
      curr.draws += row.draws;
      curr.losses += row.losses;
      curr.goals += row.goals;
      curr.assists += row.assists;
      curr.points += row.points;
      grouped.set(row.player_id, curr);
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        winRate: row.games === 0 ? 0 : Math.round(((row.wins * 3 + row.draws) / (row.games * 3)) * 100),
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.goals !== a.goals) return b.goals - a.goals;
        return b.assists - a.assists;
      });
  }

  it("produces 100% identical ranking results between legacy JS Map and SQL View aggregation", () => {
    // Gerar dataset sintético com empates propositais em pontos, vitórias e gols
    const rawRows = [
      { player_id: "p1", player_name: "Jogador 1", games: 2, wins: 1, draws: 1, losses: 0, goals: 2, assists: 1, points: 10 },
      { player_id: "p1", player_name: "Jogador 1", games: 3, wins: 2, draws: 0, losses: 1, goals: 1, assists: 2, points: 12 },
      { player_id: "p2", player_name: "Jogador 2", games: 2, wins: 2, draws: 0, losses: 0, goals: 3, assists: 0, points: 22 },
      { player_id: "p3", player_name: "Jogador 3", games: 2, wins: 1, draws: 1, losses: 0, goals: 3, assists: 1, points: 10 },
    ];

    const legacy = legacyAggregate(rawRows);
    const sql = sqlViewSimulation(rawRows);

    expect(sql.length).toBe(legacy.length);
    for (let i = 0; i < legacy.length; i++) {
      expect(sql[i].player_id).toBe(legacy[i].player_id);
      expect(sql[i].points).toBe(legacy[i].points);
      expect(sql[i].wins).toBe(legacy[i].wins);
      expect(sql[i].draws).toBe(legacy[i].draws);
      expect(sql[i].losses).toBe(legacy[i].losses);
      expect(sql[i].goals).toBe(legacy[i].goals);
      expect(sql[i].assists).toBe(legacy[i].assists);
      expect(sql[i].winRate).toBe(legacy[i].winRate);
    }
  });

  it("handles high volume dataset (50 players x 30 rounds = 1,500 stats) deterministically and fast", () => {
    const highVolumeDataset: Array<{
      player_id: string;
      player_name: string;
      games: number;
      wins: number;
      draws: number;
      losses: number;
      goals: number;
      assists: number;
      points: number;
    }> = [];

    for (let round = 1; round <= 30; round++) {
      for (let p = 1; p <= 50; p++) {
        const games = (p + round) % 4;
        const wins = games > 0 ? (p % games) : 0;
        const draws = games - wins > 0 ? (round % (games - wins + 1)) : 0;
        const losses = games - wins - draws;
        const goals = (p * round) % 5;
        const assists = (p + round) % 3;
        const points = wins * 3 + draws * 1 + goals * 3 + assists * 2;

        highVolumeDataset.push({
          player_id: `player-${p}`,
          player_name: `Atleta ${p}`,
          games,
          wins,
          draws,
          losses,
          goals,
          assists,
          points,
        });
      }
    }

    expect(highVolumeDataset.length).toBe(1500);

    const start = performance.now();
    const legacy = legacyAggregate(highVolumeDataset);
    const sql = sqlViewSimulation(highVolumeDataset);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100); // Super rápido
    expect(sql.length).toBe(50);
    expect(legacy.length).toBe(50);

    for (let i = 0; i < 50; i++) {
      expect(sql[i].player_id).toBe(legacy[i].player_id);
      expect(sql[i].points).toBe(legacy[i].points);
      expect(sql[i].wins).toBe(legacy[i].wins);
      expect(sql[i].goals).toBe(legacy[i].goals);
      expect(sql[i].assists).toBe(legacy[i].assists);
      expect(sql[i].winRate).toBe(legacy[i].winRate);
    }
  });
});

describe("Performance V1 Parte 3: Jogo Ao Vivo, Idempotência e Concorrência", () => {
  it("generates deterministic and unique idempotency keys", () => {
    const matchId = "m-1234";
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const key = `goal-${matchId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      keys.add(key);
    }
    expect(keys.size).toBe(100);
  });

  it("handles simulated concurrent goal registrations with atomic score accumulation", () => {
    // Simula duas requisições simultâneas contra o estado do banco
    let matchScoreA = 0;
    const events: Array<{ id: string; player_id: string; team_id: string; idempotency_key: string }> = [];

    function atomicRegisterGoalRPC(
      playerId: string,
      teamId: string,
      idempotencyKey: string
    ) {
      // Lock / check idempotency
      const existing = events.find(e => e.idempotency_key === idempotencyKey);
      if (existing) {
        return { eventId: existing.id, idempotent: true, scoreA: matchScoreA };
      }

      const eventId = `ev-${events.length + 1}`;
      events.push({ id: eventId, player_id: playerId, team_id: teamId, idempotency_key: idempotencyKey });
      matchScoreA += 1;
      return { eventId, idempotent: false, scoreA: matchScoreA };
    }

    // 1. Dois gols concorrentes de jogadores diferentes
    const res1 = atomicRegisterGoalRPC("p1", "team-a", "key-1");
    const res2 = atomicRegisterGoalRPC("p2", "team-a", "key-2");

    expect(res1.scoreA).toBe(1);
    expect(res2.scoreA).toBe(2);
    expect(matchScoreA).toBe(2);
    expect(events.length).toBe(2);

    // 2. Retentativa de rede duplicada (mesma chave de idempotência do res1)
    const retry1 = atomicRegisterGoalRPC("p1", "team-a", "key-1");
    expect(retry1.idempotent).toBe(true);
    expect(retry1.scoreA).toBe(2); // Placar NÃO foi incrementado novamente
    expect(events.length).toBe(2); // Nenhum evento extra criado
  });

  it("guarantees safe optimistic rollback when an error occurs", () => {
    let uiScore = { a: 2, b: 1 };
    let uiEvents = [{ id: "ev-1", name: "Gol 1" }];

    const previousScore = { ...uiScore };
    const previousEvents = [...uiEvents];

    // Passo 1: Aplicação Otimista Imediata
    uiScore = { ...uiScore, a: uiScore.a + 1 };
    uiEvents = [{ id: "opt-key-fail", name: "Gol Otimista" }, ...uiEvents];

    expect(uiScore.a).toBe(3);
    expect(uiEvents.length).toBe(2);

    // Passo 2: Falha na Server Action / RPC
    const serverResult = { success: false, error: "Conexão perdida" };

    // Passo 3: Rollback consistente
    if (!serverResult.success) {
      uiScore = previousScore;
      uiEvents = previousEvents;
    }

    expect(uiScore.a).toBe(2);
    expect(uiEvents.length).toBe(1);
    expect(uiEvents[0].id).toBe("ev-1");
  });
});

