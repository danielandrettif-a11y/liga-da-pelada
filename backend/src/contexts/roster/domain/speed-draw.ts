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
  attendanceOrder: string[];
};

export class InvalidSpeedDrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSpeedDrawError";
  }
}

export function parseSpeedUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidSpeedDrawError(`${label} inválido.`);
  }
  return normalized;
}

export function parseSpeedRating(value: unknown): SpeedRating | null {
  if (value === null) return null;
  if (value === 1 || value === 2 || value === 3) return value;
  throw new InvalidSpeedDrawError("Avaliação de velocidade inválida (deve ser 1, 2 ou 3 estrelas).");
}

function effectiveRating(player: SpeedDrawPlayer): SpeedRating {
  return player.speedRating ?? 2;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const value = random();
    const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
    const target = Math.floor(safe * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function teamAverage(team: readonly SpeedDrawPlayer[]): number {
  if (!team.length) return 0;
  return team.reduce((sum, player) => sum + effectiveRating(player), 0) / team.length;
}

function teamStarCounts(team: readonly SpeedDrawPlayer[]): { 1: number; 2: number; 3: number } {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const player of team) counts[effectiveRating(player)] += 1;
  return counts;
}

export function summarizeSpeedTeams(
  teams: readonly string[][],
  ratings: ReadonlyMap<string, SpeedRating | null>,
): SpeedTeamSummary[] {
  return teams.map((ids) => {
    const players = ids.map((id) => ({ id, speedRating: ratings.get(id) ?? null }));
    return {
      stars: teamStarCounts(players),
      average: Math.round(teamAverage(players) * 100) / 100,
    };
  });
}

function maxAverageDifference(teams: readonly SpeedDrawPlayer[][]): number {
  const averages = teams.map(teamAverage);
  return Math.max(...averages) - Math.min(...averages);
}

export function drawTeamsBySpeed(config: {
  players: SpeedDrawPlayer[];
  teamCount: number;
  playersPerTeam: number;
  random?: () => number;
  iterations?: number;
}): Omit<SpeedDrawResult, "attendanceOrder"> {
  const { teamCount, playersPerTeam, random = Math.random, iterations = 50 } = config;
  const available = config.players.slice(0, teamCount * playersPerTeam);
  const unratedCount = available.filter((player) => player.speedRating === null).length;
  if (available.length < teamCount) {
    return {
      teams: Array.from({ length: teamCount }, () => []),
      teamSummaries: Array.from({ length: teamCount }, () => ({ stars: { 1: 0, 2: 0, 3: 0 }, average: 0 })),
      unratedCount,
    };
  }

  const byRating: Record<SpeedRating, SpeedDrawPlayer[]> = { 1: [], 2: [], 3: [] };
  for (const player of available) byRating[effectiveRating(player)].push(player);

  const generateSolution = (): SpeedDrawPlayer[][] => {
    const teams: SpeedDrawPlayer[][] = Array.from({ length: teamCount }, () => []);
    for (const rating of [3, 1, 2] as SpeedRating[]) {
      const players = shuffle(byRating[rating], random);
      for (const player of players) {
        const target = teams
          .map((team, index) => ({
            index,
            sameRatingCount: team.filter((item) => effectiveRating(item) === rating).length,
            size: team.length,
          }))
          .filter((team) => team.size < playersPerTeam)
          .sort((left, right) => left.sameRatingCount - right.sameRatingCount || left.size - right.size)[0];
        if (target) teams[target.index]!.push(player);
      }
    }
    return teams;
  };

  const improve = (source: SpeedDrawPlayer[][]): SpeedDrawPlayer[][] => {
    const teams = source.map((team) => [...team]);
    if (teamCount < 2) return teams;
    let bestDifference = maxAverageDifference(teams);
    for (let attempt = 0; attempt < teamCount * 5; attempt += 1) {
      const firstTeam = Math.floor(random() * teamCount);
      let secondTeam = Math.floor(random() * (teamCount - 1));
      if (secondTeam >= firstTeam) secondTeam += 1;
      const first = teams[firstTeam]!;
      const second = teams[secondTeam]!;
      if (!first.length || !second.length) continue;
      const firstPlayer = Math.floor(random() * first.length);
      const secondPlayer = Math.floor(random() * second.length);
      [first[firstPlayer], second[secondPlayer]] = [
        second[secondPlayer]!, first[firstPlayer]!,
      ];
      const difference = maxAverageDifference(teams);
      if (difference < bestDifference - 0.001) bestDifference = difference;
      else [first[firstPlayer], second[secondPlayer]] = [
        second[secondPlayer]!, first[firstPlayer]!,
      ];
    }
    return teams;
  };

  const solutions = Array.from({ length: Math.max(1, iterations) }, () => improve(generateSolution()));
  const differences = solutions.map(maxAverageDifference);
  const bestDifference = Math.min(...differences);
  const best = solutions.filter((_, index) => Math.abs(differences[index]! - bestDifference) < 0.001);
  const chosen = best[Math.floor(random() * best.length)]!;
  return {
    teams: chosen.map((team) => team.map((player) => player.id)),
    teamSummaries: chosen.map((team) => ({
      stars: teamStarCounts(team), average: Math.round(teamAverage(team) * 100) / 100,
    })),
    unratedCount,
  };
}

export function drawTeamsWithAttendance(config: {
  players: SpeedDrawPlayer[];
  attendanceOrder: string[];
  teamCount: number;
  playersPerTeam: number;
  random?: () => number;
}): SpeedDrawResult {
  const { players, teamCount, playersPerTeam, random = Math.random } = config;
  const minimumPresent = playersPerTeam * 2;
  const playerById = new Map(players.map((player) => [player.id, player]));
  const attendance = [...new Set(config.attendanceOrder)].filter((id) => playerById.has(id));
  if (attendance.length < minimumPresent) {
    throw new InvalidSpeedDrawError(`Marque pelo menos ${minimumPresent} presenças.`);
  }
  const starterIds = attendance.slice(0, minimumPresent);
  const starterResult = drawTeamsBySpeed({
    players: starterIds.map((id) => playerById.get(id)!), teamCount: 2, playersPerTeam, random,
  });
  const starterSet = new Set(starterIds);
  const waitingIds = [
    ...attendance.slice(minimumPresent),
    ...players.map((player) => player.id).filter((id) => !starterSet.has(id) && !attendance.includes(id)),
  ];
  const waitingTeams = Array.from({ length: Math.max(0, teamCount - 2) }, (_, index) =>
    waitingIds.slice(index * playersPerTeam, (index + 1) * playersPerTeam));
  const teams = [...starterResult.teams, ...waitingTeams];
  const ratings = new Map(players.map((player) => [player.id, player.speedRating]));
  return {
    teams,
    teamSummaries: summarizeSpeedTeams(teams, ratings),
    unratedCount: players.filter((player) => player.speedRating === null).length,
    attendanceOrder: attendance,
  };
}
