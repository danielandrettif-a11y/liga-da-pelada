import type { PlayerProfile } from "./types";

export type DraftBalancePlayer = {
  id: string;
  teamSlot: number;
  overall: number | null;
  speedRating: number | null;
  profile: PlayerProfile | null;
  isCaptain: boolean;
};

export type DraftTeamBalance = {
  teamSlot: number;
  overallAverage: number;
  starsAverage: number;
  profiles: Record<PlayerProfile, number>;
};

export type DraftSwapSuggestion = {
  playerAId: string;
  playerBId: string;
  fromTeamSlot: number;
  toTeamSlot: number;
  projectedScore: number;
};

const PROFILES: PlayerProfile[] = ["defensive", "midfield", "offensive"];
const SNAKE_ORDER = [1, 2, 3, 3, 2, 1] as const;
const rounded = (value: number, digits = 1) => Number(value.toFixed(digits));

export function draftSelectionOrder(pickNumber: number) {
  return SNAKE_ORDER[(Math.max(1, Math.trunc(pickNumber)) - 1) % SNAKE_ORDER.length];
}

export function summarizeDraftTeams(players: DraftBalancePlayer[]): DraftTeamBalance[] {
  return [1, 2, 3].map((teamSlot) => {
    const roster = players.filter((player) => player.teamSlot === teamSlot);
    const divisor = Math.max(1, roster.length);
    const profiles = { defensive: 0, midfield: 0, offensive: 0 };
    roster.forEach((player) => {
      if (player.profile) profiles[player.profile] += 1;
    });
    return {
      teamSlot,
      overallAverage: rounded(roster.reduce((total, player) => total + (player.overall ?? 70), 0) / divisor),
      starsAverage: rounded(roster.reduce((total, player) => total + (player.speedRating ?? 2), 0) / divisor, 2),
      profiles,
    };
  });
}

export function calculateDraftBalanceScore(players: DraftBalancePlayer[]) {
  const summaries = summarizeDraftTeams(players);
  const overalls = summaries.map((team) => team.overallAverage);
  const stars = summaries.map((team) => team.starsAverage);
  const maxRoster = Math.max(1, ...summaries.map((team) => players.filter((player) => player.teamSlot === team.teamSlot).length));
  const overallGap = Math.min(1, (Math.max(...overalls) - Math.min(...overalls)) / 10);
  const starsGap = Math.min(1, (Math.max(...stars) - Math.min(...stars)) / 2);
  const profileGap = PROFILES.reduce((total, profile) => {
    const values = summaries.map((team) => team.profiles[profile]);
    return total + ((Math.max(...values) - Math.min(...values)) / maxRoster);
  }, 0) / PROFILES.length;
  return Math.round(Math.max(0, 100 - ((overallGap * 0.45) + (starsGap * 0.4) + (Math.min(1, profileGap) * 0.15)) * 100));
}

export function findBestDraftSwap(players: DraftBalancePlayer[]): DraftSwapSuggestion | null {
  const currentScore = calculateDraftBalanceScore(players);
  let best: DraftSwapSuggestion | null = null;
  const swappable = players.filter((player) => !player.isCaptain);
  for (let first = 0; first < swappable.length; first += 1) {
    for (let second = first + 1; second < swappable.length; second += 1) {
      const a = swappable[first];
      const b = swappable[second];
      if (a.teamSlot === b.teamSlot) continue;
      const candidate = players.map((player) => {
        if (player.id === a.id) return { ...player, teamSlot: b.teamSlot };
        if (player.id === b.id) return { ...player, teamSlot: a.teamSlot };
        return player;
      });
      const score = calculateDraftBalanceScore(candidate);
      if (score > currentScore && (!best || score > best.projectedScore)) {
        best = { playerAId: a.id, playerBId: b.id, fromTeamSlot: a.teamSlot, toTeamSlot: b.teamSlot, projectedScore: score };
      }
    }
  }
  return best;
}
