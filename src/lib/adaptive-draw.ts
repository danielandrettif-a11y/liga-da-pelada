import type { PlayerProfile } from "./types";
import type { SpeedRating } from "./speed-draw";

export type AdaptiveDrawPlayer = {
  id: string;
  overall: number | null;
  speedRating: SpeedRating | null;
  playerProfile: PlayerProfile | null;
};

export type AdaptiveTeamSummary = {
  overallAverage: number;
  speedAverage: number;
  profiles: Record<PlayerProfile, number>;
};

export type AdaptiveDrawResult = {
  teams: string[][];
  teamSummaries: AdaptiveTeamSummary[];
  missingOverallCount: number;
  missingSpeedCount: number;
  balanceScore: number;
};

const PROFILES: PlayerProfile[] = ["defensive", "midfield", "offensive"];

function safeRandom(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(safeRandom(random) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function median(values: number[], fallback: number) {
  if (!values.length) return fallback;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function summarize(
  teams: AdaptiveDrawPlayer[][],
  fallbackOverall: number,
): AdaptiveTeamSummary[] {
  return teams.map((team) => {
    const divisor = Math.max(1, team.length);
    const profiles = { defensive: 0, midfield: 0, offensive: 0 };
    for (const player of team) {
      if (player.playerProfile) profiles[player.playerProfile] += 1;
    }
    return {
      overallAverage: round(team.reduce((total, player) => total + (player.overall ?? fallbackOverall), 0) / divisor),
      speedAverage: round(team.reduce((total, player) => total + (player.speedRating ?? 2), 0) / divisor),
      profiles,
    };
  });
}

/**
 * Nota de desequilibrio: 45% OVR, 40% velocidade e 15% composicao de funcoes.
 * Quanto menor, mais proximos estao os times. As escalas convertem uma
 * diferenca de 10 OVR ou 2 estrelas no pior caso de cada eixo.
 */
function imbalanceScore(teams: AdaptiveDrawPlayer[][], fallbackOverall: number, playersPerTeam: number) {
  const summaries = summarize(teams, fallbackOverall);
  const overallValues = summaries.map((item) => item.overallAverage);
  const speedValues = summaries.map((item) => item.speedAverage);
  const overallGap = Math.min(1, (Math.max(...overallValues) - Math.min(...overallValues)) / 10);
  const speedGap = Math.min(1, (Math.max(...speedValues) - Math.min(...speedValues)) / 2);
  const profileGap = PROFILES.reduce((total, profile) => {
    const values = summaries.map((item) => item.profiles[profile]);
    return total + (Math.max(...values) - Math.min(...values)) / Math.max(1, playersPerTeam);
  }, 0) / PROFILES.length;
  return overallGap * 0.45 + speedGap * 0.40 + Math.min(1, profileGap) * 0.15;
}

export function drawTeamsAdaptive({
  players,
  teamCount,
  playersPerTeam,
  random = Math.random,
  iterations = 1000,
}: {
  players: AdaptiveDrawPlayer[];
  teamCount: number;
  playersPerTeam: number;
  random?: () => number;
  iterations?: number;
}): AdaptiveDrawResult {
  const capacity = teamCount * playersPerTeam;
  const available = players.slice(0, capacity);
  const knownOveralls = available.map((player) => player.overall).filter((value): value is number => Number.isFinite(value));
  const fallbackOverall = median(knownOveralls, 70);
  const missingOverallCount = available.filter((player) => !Number.isFinite(player.overall)).length;
  const missingSpeedCount = available.filter((player) => player.speedRating === null).length;

  if (available.length < teamCount) {
    const empty = Array.from({ length: teamCount }, () => [] as AdaptiveDrawPlayer[]);
    return { teams: empty.map(() => []), teamSummaries: summarize(empty, fallbackOverall), missingOverallCount, missingSpeedCount, balanceScore: 1 };
  }

  let bestTeams: AdaptiveDrawPlayer[][] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const attempts = Math.max(1, Math.trunc(iterations));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = Array.from({ length: teamCount }, () => [] as AdaptiveDrawPlayer[]);
    shuffle(available, random).forEach((player, index) => candidate[index % teamCount].push(player));
    let candidateScore = imbalanceScore(candidate, fallbackOverall, playersPerTeam);

    // Trocas locais refinam a amostra sem favorecer sempre a mesma ordem.
    for (let swapAttempt = 0; swapAttempt < teamCount * playersPerTeam * 2; swapAttempt += 1) {
      const firstTeam = Math.floor(safeRandom(random) * teamCount);
      let secondTeam = Math.floor(safeRandom(random) * Math.max(1, teamCount - 1));
      if (secondTeam >= firstTeam) secondTeam += 1;
      if (!candidate[firstTeam]?.length || !candidate[secondTeam]?.length) continue;
      const firstPlayer = Math.floor(safeRandom(random) * candidate[firstTeam].length);
      const secondPlayer = Math.floor(safeRandom(random) * candidate[secondTeam].length);
      [candidate[firstTeam][firstPlayer], candidate[secondTeam][secondPlayer]] = [candidate[secondTeam][secondPlayer], candidate[firstTeam][firstPlayer]];
      const swappedScore = imbalanceScore(candidate, fallbackOverall, playersPerTeam);
      if (swappedScore <= candidateScore) candidateScore = swappedScore;
      else [candidate[firstTeam][firstPlayer], candidate[secondTeam][secondPlayer]] = [candidate[secondTeam][secondPlayer], candidate[firstTeam][firstPlayer]];
    }

    if (candidateScore < bestScore) {
      bestScore = candidateScore;
      bestTeams = candidate.map((team) => [...team]);
    }
  }

  const chosen = bestTeams || Array.from({ length: teamCount }, () => [] as AdaptiveDrawPlayer[]);
  return {
    teams: chosen.map((team) => team.map((player) => player.id)),
    teamSummaries: summarize(chosen, fallbackOverall),
    missingOverallCount,
    missingSpeedCount,
    balanceScore: round(Math.max(0, 100 - bestScore * 100)),
  };
}
