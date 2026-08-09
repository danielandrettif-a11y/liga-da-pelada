import type { SeasonStatus } from "./types";

export type PlayerAwardType = "topScorer" | "topAssister" | "bestGoalkeeper";

export type PlayerAward = {
  type: PlayerAwardType;
  roundId: string;
  roundNumber: number;
  roundDate: string;
};

export type PlayerAwardSeason = {
  seasonId: string;
  seasonNumber: number;
  seasonStatus: SeasonStatus;
  awards: PlayerAward[];
};

export type AwardRound = {
  id: string;
  number: number;
  date: string;
  seasonId: string;
  seasonNumber: number;
  seasonStatus: SeasonStatus;
  bestGoalkeeperPlayerId: string | null;
};

export type AwardStat = {
  player_id: string;
  round_id: string;
  goals: number;
  assists: number;
};

export function buildAwardSeasonsByPlayer(rounds: AwardRound[], stats: AwardStat[]) {
  const roundsById = new Map(rounds.map((round) => [round.id, round]));
  const statsByRound = new Map<string, AwardStat[]>();
  const seasonsByPlayer = new Map<string, Map<string, PlayerAwardSeason>>();

  function ensureSeason(playerId: string, round: AwardRound) {
    const playerSeasons = seasonsByPlayer.get(playerId) || new Map<string, PlayerAwardSeason>();
    const season = playerSeasons.get(round.seasonId) || {
      seasonId: round.seasonId,
      seasonNumber: round.seasonNumber,
      seasonStatus: round.seasonStatus,
      awards: [],
    };
    playerSeasons.set(round.seasonId, season);
    seasonsByPlayer.set(playerId, playerSeasons);
    return season;
  }

  for (const stat of stats) {
    const round = roundsById.get(stat.round_id);
    if (!round) continue;
    ensureSeason(stat.player_id, round);
    const roundStats = statsByRound.get(stat.round_id) || [];
    roundStats.push(stat);
    statsByRound.set(stat.round_id, roundStats);
  }

  for (const round of rounds) {
    const roundStats = statsByRound.get(round.id) || [];
    const mostGoals = Math.max(0, ...roundStats.map((stat) => stat.goals));
    const mostAssists = Math.max(0, ...roundStats.map((stat) => stat.assists));

    for (const stat of roundStats) {
      const season = ensureSeason(stat.player_id, round);
      if (mostGoals > 0 && stat.goals === mostGoals) {
        season.awards.push({ type: "topScorer", roundId: round.id, roundNumber: round.number, roundDate: round.date });
      }
      if (mostAssists > 0 && stat.assists === mostAssists) {
        season.awards.push({ type: "topAssister", roundId: round.id, roundNumber: round.number, roundDate: round.date });
      }
    }

    if (round.bestGoalkeeperPlayerId) {
      ensureSeason(round.bestGoalkeeperPlayerId, round).awards.push({
        type: "bestGoalkeeper",
        roundId: round.id,
        roundNumber: round.number,
        roundDate: round.date,
      });
    }
  }

  return new Map(
    Array.from(seasonsByPlayer, ([playerId, seasons]) => [
      playerId,
      Array.from(seasons.values()).sort((a, b) => b.seasonNumber - a.seasonNumber),
    ]),
  );
}

export function countAwards(seasons: PlayerAwardSeason[], status?: SeasonStatus) {
  const counts = { topScorer: 0, topAssister: 0, bestGoalkeeper: 0 };
  for (const season of seasons) {
    if (status && season.seasonStatus !== status) continue;
    for (const award of season.awards) counts[award.type] += 1;
  }
  return counts;
}
