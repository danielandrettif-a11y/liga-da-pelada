import type { PlayerProfile, PrivateBalanceTag, TeamFormationMode } from "./types";

export type RoundReshuffleMode = Exclude<TeamFormationMode, "manual">;

export type RoundReshufflePlayer = {
  id: string;
  overall: number | null;
  speedRating: 1 | 2 | 3 | null;
  playerProfile: PlayerProfile | null;
  isGoalkeeper: boolean;
  balanceTag?: PrivateBalanceTag | null;
};

export type RoundReshuffleSummary = {
  overallAverage: number;
  speedAverage: number;
  profiles: Record<PlayerProfile, number>;
};

export type RoundReshuffleResult = {
  teams: string[][];
  summaries: RoundReshuffleSummary[];
  balanceScore: number;
};

type WorkingTeam = {
  capacity: number;
  players: RoundReshufflePlayer[];
  overallTotal: number;
  effectiveOverallTotal: number;
  speedTotal: number;
  profiles: Record<PlayerProfile, number>;
  goalkeepers: number;
  bagres: number;
  craques: number;
};

const PROFILES: PlayerProfile[] = ["defensive", "midfield", "offensive"];

function balanceTagOverallDelta(tag: PrivateBalanceTag | null | undefined) {
  return tag === "craque_2" ? 4 : tag === "craque_1" ? 2 : tag === "bagre_2" ? -4 : tag === "bagre_1" ? -2 : 0;
}

function rounded(value: number, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function median(values: number[], fallback: number) {
  if (!values.length) return fallback;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function shuffle<T>(items: T[], random: () => number) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const value = random();
    const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
    const swapIndex = Math.floor(safeValue * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function makeWorkingTeams(capacities: number[]): WorkingTeam[] {
  return capacities.map((capacity) => ({
    capacity,
    players: [],
    overallTotal: 0,
    effectiveOverallTotal: 0,
    speedTotal: 0,
    profiles: { defensive: 0, midfield: 0, offensive: 0 },
    goalkeepers: 0,
    bagres: 0,
    craques: 0,
  }));
}

function addPlayer(team: WorkingTeam, player: RoundReshufflePlayer, fallbackOverall: number) {
  team.players.push(player);
  team.overallTotal += player.overall ?? fallbackOverall;
  team.effectiveOverallTotal += (player.overall ?? fallbackOverall) + balanceTagOverallDelta(player.balanceTag);
  team.speedTotal += player.speedRating ?? 2;
  if (player.playerProfile) team.profiles[player.playerProfile] += 1;
  if (player.isGoalkeeper) team.goalkeepers += 1;
  if (player.balanceTag?.startsWith("bagre_")) team.bagres += 1;
  if (player.balanceTag?.startsWith("craque_")) team.craques += 1;
}

function summarize(teams: WorkingTeam[]) {
  return teams.map((team) => {
    const count = Math.max(1, team.players.length);
    return {
      overallAverage: rounded(team.overallTotal / count),
      speedAverage: rounded(team.speedTotal / count, 2),
      profiles: { ...team.profiles },
    };
  });
}

function calculateBalanceScore(summaries: RoundReshuffleSummary[]) {
  if (summaries.length < 2) return 100;
  const overallValues = summaries.map((summary) => summary.overallAverage);
  const speedValues = summaries.map((summary) => summary.speedAverage);
  const overallGap = Math.min(1, (Math.max(...overallValues) - Math.min(...overallValues)) / 10);
  const speedGap = Math.min(1, (Math.max(...speedValues) - Math.min(...speedValues)) / 2);
  const profileGap = PROFILES.reduce((total, profile) => {
    const values = summaries.map((summary) => summary.profiles[profile]);
    return total + Math.max(...values) - Math.min(...values);
  }, 0) / Math.max(1, summaries.length * 3);
  return rounded(Math.max(0, 100 - ((overallGap * 0.45) + (speedGap * 0.4) + (Math.min(1, profileGap) * 0.15)) * 100), 0);
}

/**
 * Cria uma prévia sem alterar a rodada. A capacidade de cada time é mantida,
 * inclusive em rodadas com times incompletos.
 */
export function previewRoundReshuffle({
  players,
  capacities,
  mode,
  random = Math.random,
}: {
  players: RoundReshufflePlayer[];
  capacities: number[];
  mode: RoundReshuffleMode;
  random?: () => number;
}): RoundReshuffleResult {
  const totalCapacity = capacities.reduce((total, capacity) => total + Math.max(0, capacity), 0);
  const available = players.slice(0, totalCapacity);
  const fallbackOverall = median(available.flatMap((player) => Number.isFinite(player.overall) ? [player.overall as number] : []), 70);
  const teams = makeWorkingTeams(capacities);

  if (mode === "random") {
    const shuffled = shuffle(available, random);
    let cursor = 0;
    for (const team of teams) {
      for (let slot = 0; slot < team.capacity && cursor < shuffled.length; slot += 1) {
        addPlayer(team, shuffled[cursor], fallbackOverall);
        cursor += 1;
      }
    }
  } else {
    const ordered = [...available]
      .map((player) => ({ player, tieBreaker: random() }))
      .sort((left, right) => {
        const leftPrimary = mode === "speed"
          ? (left.player.speedRating ?? 2)
          : (left.player.overall ?? fallbackOverall) + (mode === "adaptive" ? balanceTagOverallDelta(left.player.balanceTag) : 0);
        const rightPrimary = mode === "speed"
          ? (right.player.speedRating ?? 2)
          : (right.player.overall ?? fallbackOverall) + (mode === "adaptive" ? balanceTagOverallDelta(right.player.balanceTag) : 0);
        return rightPrimary - leftPrimary || right.tieBreaker - left.tieBreaker;
      });

    for (const { player } of ordered) {
      const profile = player.playerProfile;
      const availableTeams = teams
        .map((team, index) => ({ team, index }))
        .filter(({ team }) => team.players.length < team.capacity);
      const selected = availableTeams
        .map(({ team, index }) => {
          const overallLoad = team.overallTotal / Math.max(1, team.capacity * 10);
          const effectiveOverallLoad = team.effectiveOverallTotal / Math.max(1, team.capacity * 10);
          const speedLoad = team.speedTotal / Math.max(1, team.capacity * 3);
          const profileLoad = profile ? team.profiles[profile] / Math.max(1, team.capacity) : 0;
          const goalkeeperLoad = player.isGoalkeeper ? team.goalkeepers / Math.max(1, team.capacity) : 0;
          const tagCollisionLoad = player.balanceTag?.startsWith("bagre_")
            ? team.bagres / Math.max(1, team.capacity)
            : player.balanceTag?.startsWith("craque_")
              ? team.craques / Math.max(1, team.capacity)
              : 0;
          const score = mode === "balanced"
            ? overallLoad * 0.75 + profileLoad * 0.18 + goalkeeperLoad * 0.07
            : mode === "speed"
              ? speedLoad * 0.9 + goalkeeperLoad * 0.1
              : effectiveOverallLoad * 0.40 + overallLoad * 0.15 + speedLoad * 0.25
                + profileLoad * 0.1 + goalkeeperLoad * 0.05 + tagCollisionLoad * 0.20;
          return { team, index, score, tieBreaker: random() };
        })
        .sort((left, right) => left.score - right.score || left.tieBreaker - right.tieBreaker)[0];
      if (selected) addPlayer(selected.team, player, fallbackOverall);
    }
  }

  const summaries = summarize(teams);
  return {
    teams: teams.map((team) => team.players.map((player) => player.id)),
    summaries,
    balanceScore: calculateBalanceScore(summaries),
  };
}
