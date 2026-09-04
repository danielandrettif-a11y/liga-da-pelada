/**
 * Sorteio por Velocidade — modo direto que distribui jogadores entre times
 * equilibrando a quantidade de atletas de cada nível de velocidade (★).
 *
 * Jogadores sem avaliação são tratados em memória como 2★ sem gravar esse
 * valor; somente o ADM vê o aviso.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type SpeedRating = 1 | 2 | 3;

export type SpeedDrawPlayer = {
  id: string;
  speedRating: SpeedRating | null;
};

export type SpeedTeamSummary = {
  stars: { 1: number; 2: number; 3: number };
  average: number;
};

export type SpeedDrawResult = {
  teams: string[][];
  teamSummaries: SpeedTeamSummary[];
  unratedCount: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveRating(player: SpeedDrawPlayer): SpeedRating {
  return player.speedRating ?? 2;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const value = random();
    const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
    const j = Math.floor(safe * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function teamAverage(team: SpeedDrawPlayer[]): number {
  if (!team.length) return 0;
  return team.reduce((sum, p) => sum + effectiveRating(p), 0) / team.length;
}

function teamStarCounts(team: SpeedDrawPlayer[]): { 1: number; 2: number; 3: number } {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const p of team) counts[effectiveRating(p)] += 1;
  return counts;
}

function maxDiff(teams: SpeedDrawPlayer[][]): number {
  const averages = teams.map(teamAverage);
  return Math.max(...averages) - Math.min(...averages);
}

// ---------------------------------------------------------------------------
// Algoritmo principal
// ---------------------------------------------------------------------------

/**
 * Distribui jogadores equilibrando por nível de velocidade.
 *
 * Prioridades na ordem:
 * 1. Tamanho (todos os times devem ter a mesma quantidade)
 * 2. Distribuição de 3★
 * 3. Distribuição de 1★
 * 4. Distribuição de 2★
 * 5. Média geral
 *
 * Gera soluções aleatórias, aplica trocas locais e escolhe aleatoriamente
 * entre as melhores equivalentes.
 */
export function drawTeamsBySpeed(config: {
  players: SpeedDrawPlayer[];
  teamCount: number;
  playersPerTeam: number;
  random?: () => number;
  iterations?: number;
}): SpeedDrawResult {
  const { teamCount, playersPerTeam, random = Math.random, iterations = 50 } = config;
  const capacity = teamCount * playersPerTeam;
  const available = config.players.slice(0, capacity);
  const unratedCount = available.filter((p) => p.speedRating === null).length;

  if (available.length < teamCount) {
    return {
      teams: Array.from({ length: teamCount }, () => []),
      teamSummaries: Array.from({ length: teamCount }, () => ({ stars: { 1: 0, 2: 0, 3: 0 }, average: 0 })),
      unratedCount,
    };
  }

  // Separar por nível
  const byRating: Record<SpeedRating, SpeedDrawPlayer[]> = { 1: [], 2: [], 3: [] };
  for (const p of available) {
    byRating[effectiveRating(p)].push(p);
  }

  function generateSolution(): SpeedDrawPlayer[][] {
    const teams: SpeedDrawPlayer[][] = Array.from({ length: teamCount }, () => []);

    // Distribuir cada nível uniformemente (round-robin embaralhado)
    for (const rating of [3, 1, 2] as SpeedRating[]) {
      const shuffled = shuffle(byRating[rating], random);
      for (let i = 0; i < shuffled.length; i += 1) {
        // Encontrar o time com menos jogadores desse nível e menor tamanho geral
        const target = teams
          .map((team, idx) => ({
            idx,
            sameRatingCount: team.filter((p) => effectiveRating(p) === rating).length,
            size: team.length,
          }))
          .filter((t) => t.size < playersPerTeam)
          .sort((a, b) => a.sameRatingCount - b.sameRatingCount || a.size - b.size)[0];
        if (target) teams[target.idx].push(shuffled[i]);
      }
    }

    return teams;
  }

  function localSwap(teams: SpeedDrawPlayer[][]): SpeedDrawPlayer[][] {
    const best = teams.map((t) => [...t]);
    if (teamCount < 2) return best;
    let bestDiff = maxDiff(best);

    for (let attempt = 0; attempt < teamCount * 5; attempt += 1) {
      const t1 = Math.floor(random() * teamCount);
      let t2 = Math.floor(random() * (teamCount - 1));
      if (t2 >= t1) t2 += 1;
      if (!best[t1].length || !best[t2].length) continue;

      const p1 = Math.floor(random() * best[t1].length);
      const p2 = Math.floor(random() * best[t2].length);

      // Tenta a troca
      [best[t1][p1], best[t2][p2]] = [best[t2][p2], best[t1][p1]];
      const newDiff = maxDiff(best);

      if (newDiff < bestDiff - 0.001) {
        bestDiff = newDiff;
      } else {
        // Desfaz
        [best[t1][p1], best[t2][p2]] = [best[t2][p2], best[t1][p1]];
      }
    }

    return best;
  }

  // Gerar N soluções e escolher entre as melhores
  const solutions: SpeedDrawPlayer[][][] = [];
  for (let i = 0; i < iterations; i += 1) {
    const raw = generateSolution();
    solutions.push(localSwap(raw));
  }

  // Encontrar a melhor diferença
  const diffs = solutions.map(maxDiff);
  const bestDiff = Math.min(...diffs);
  const bestSolutions = solutions.filter((_, i) => Math.abs(diffs[i] - bestDiff) < 0.001);

  // Escolher aleatoriamente entre as melhores
  const chosen = bestSolutions[Math.floor(random() * bestSolutions.length)];

  return {
    teams: chosen.map((team) => team.map((p) => p.id)),
    teamSummaries: chosen.map((team) => ({
      stars: teamStarCounts(team),
      average: Math.round(teamAverage(team) * 100) / 100,
    })),
    unratedCount,
  };
}
