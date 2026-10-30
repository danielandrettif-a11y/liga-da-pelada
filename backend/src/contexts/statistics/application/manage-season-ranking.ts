import type { Actor } from "../../../shared/actor.js";
import {
  aggregateRankingRows,
  buildAwardSeasonsByPlayer,
  countAwards,
  rankingActivePlayerIds,
  type OfficialRoundMeta,
  type OverallTrend,
  type PlayerAchievementBelt,
  type PlayerEquippedCosmetics,
  type RankingDetailStatsRow,
  type RankingEnrichment,
  type RankingEntry,
  type RankingExperienceData,
  type RankingPlayer,
  type VisibleSeasonMeta,
} from "../domain/season-ranking.js";

export type RankingRawEnrichmentData = {
  fitnessRows: Array<{ player_id: string; distance_km: number; average_speed_kmh: number }>;
  cosmeticsByPlayer: Map<string, PlayerEquippedCosmetics>;
  overallByPlayer: Map<
    string,
    {
      overall: number;
      trend: OverallTrend;
      positions: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
      positionTrends: Record<"DEF" | "ALA_MEI" | "ATA" | "GOL", OverallTrend>;
      goalkeeperGames: number;
      goalkeeperRounds: number;
      roundsPlayed: number;
    }
  >;
  speedByPlayer: Map<string, 1 | 2 | 3>;
  achievementBeltsByPlayer: Map<string, PlayerAchievementBelt[]>;
};

export interface SeasonRankingRepository {
  findActiveSeason(actor: Actor, leagueId: string): Promise<VisibleSeasonMeta | null>;
  findVisibleSeasons(actor: Actor, leagueId: string, currentSeasonId: string): Promise<VisibleSeasonMeta[]>;
  findFinishedOfficialRounds(actor: Actor, seasonIds: string[]): Promise<OfficialRoundMeta[]>;
  findPlayerRoundStats(actor: Actor, roundIds: string[]): Promise<RankingDetailStatsRow[]>;
  findEnrichmentData(
    actor: Actor,
    leagueId: string,
    seasonId: string,
    roundIds: string[],
    playerIds?: string[],
  ): Promise<RankingRawEnrichmentData>;
  findLeaguePlayer(actor: Actor, leagueId: string, playerId: string): Promise<RankingPlayer | null>;
  findPlayerCosmetics(actor: Actor, playerId: string): Promise<PlayerEquippedCosmetics | null>;
}

export class ManageSeasonRankingUseCase {
  constructor(private readonly repository: SeasonRankingRepository) {}

  async getSeasonRankingExperience(
    actor: Actor,
    leagueId: string,
    options: { includeEnrichment?: boolean } = { includeEnrichment: true },
  ): Promise<RankingExperienceData> {
    const emptyData: RankingExperienceData = {
      seasonLabel: "Temporada atual",
      general: [],
      monthly: null,
      latestRound: null,
    };

    const activeSeason = await this.repository.findActiveSeason(actor, leagueId);
    if (!activeSeason) return emptyData;

    const seasonYear = activeSeason.startedAt ? new Date(activeSeason.startedAt).getFullYear() : new Date().getFullYear();
    const seasonLabel = `Temporada ${activeSeason.number} · ${seasonYear}`;

    const previousSeasons = await this.repository.findVisibleSeasons(actor, leagueId, activeSeason.id);
    const visibleSeasons = [activeSeason, ...previousSeasons];
    const visibleSeasonsMap = new Map(visibleSeasons.map((s) => [s.id, s]));

    const rounds = await this.repository.findFinishedOfficialRounds(
      actor,
      visibleSeasons.map((s) => s.id),
    );

    const currentRounds = rounds.filter((r) => r.seasonId === activeSeason.id);
    const latestRound = currentRounds[0];
    if (currentRounds.length === 0 || !latestRound) {
      return { ...emptyData, seasonLabel };
    }

    const roundIds = rounds.map((r) => r.id);
    const rawStats = await this.repository.findPlayerRoundStats(actor, roundIds);

    const currentRoundIds = new Set(currentRounds.map((r) => r.id));
    const eligibleCurrentStats = rawStats.filter(
      (row) => currentRoundIds.has(row.round_id) && row.player?.is_competitive_profile_complete,
    );
    const roundsMap = new Map(rounds.map((r) => [r.id, r]));

    const activePlayerIds = rankingActivePlayerIds(
      currentRounds.slice(0, 3).map((r) => r.id),
      eligibleCurrentStats,
    );
    const previousActivePlayerIds = rankingActivePlayerIds(
      currentRounds.slice(1, 4).map((r) => r.id),
      eligibleCurrentStats,
    );

    const currentStats = eligibleCurrentStats.filter((row) => activePlayerIds.has(row.player_id));
    const generalBase = aggregateRankingRows(currentStats, roundsMap, 6);
    const previousBase = aggregateRankingRows(
      eligibleCurrentStats.filter((row) => row.round_id !== latestRound.id && previousActivePlayerIds.has(row.player_id)),
      roundsMap,
      6,
    );
    const latestBase = aggregateRankingRows(
      currentStats.filter((row) => row.round_id === latestRound.id),
      roundsMap,
      6,
    );

    const monthlyKey = String(latestRound.date).slice(0, 7);
    const monthlyRoundIds = new Set(
      currentRounds.filter((r) => String(r.date).slice(0, 7) === monthlyKey).map((r) => r.id),
    );
    const monthlyBase = aggregateRankingRows(
      currentStats.filter((row) => monthlyRoundIds.has(row.round_id)),
      roundsMap,
      Number.MAX_SAFE_INTEGER,
    );

    const previousPositions = new Map(previousBase.map((entry, index) => [entry.player.id, index + 1]));
    const seasonPositions = new Map(generalBase.map((entry, index) => [entry.player.id, index + 1]));

    const awardSeasonsByPlayer = buildAwardSeasonsByPlayer(rounds, rawStats, visibleSeasonsMap);

    const includeEnrichment = options.includeEnrichment !== false;
    const enrichment = includeEnrichment
      ? await this.repository.findEnrichmentData(
          actor,
          leagueId,
          activeSeason.id,
          currentRounds.map((r) => r.id),
        )
      : {
          fitnessRows: [],
          cosmeticsByPlayer: new Map(),
          overallByPlayer: new Map(),
          speedByPlayer: new Map(),
          achievementBeltsByPlayer: new Map(),
        };

    const fitnessByPlayer = new Map<string, { distanceKm: number; speedTotal: number; entries: number }>();
    for (const row of enrichment.fitnessRows) {
      const current = fitnessByPlayer.get(row.player_id) || { distanceKm: 0, speedTotal: 0, entries: 0 };
      current.distanceKm += Number(row.distance_km || 0);
      current.speedTotal += Number(row.average_speed_kmh || 0);
      current.entries += 1;
      fitnessByPlayer.set(row.player_id, current);
    }

    const getFitness = (playerId: string) => {
      const val = fitnessByPlayer.get(playerId);
      if (!val || val.entries === 0) return null;
      return {
        distanceKm: Math.round(val.distanceKm * 100) / 100,
        averageSpeedKmh: Math.round((val.speedTotal / val.entries) * 100) / 100,
        entries: val.entries,
      };
    };

    const getAwardSeasons = (playerId: string) => awardSeasonsByPlayer.get(playerId) || [];
    const getMonthlyAwardSeasons = (playerId: string) =>
      getAwardSeasons(playerId).map((awardSeason) => ({
        ...awardSeason,
        awards: awardSeason.awards.filter((award) => String(award.roundDate).slice(0, 7) === monthlyKey),
      }));

    const buildFullEntry = (
      base: (typeof generalBase)[number],
      index: number,
      isMonthly = false,
      isLatest = false,
    ): RankingEntry => {
      const playerId = base.player.id;
      const previousPosition = previousPositions.get(playerId);
      const awardSeasons = isMonthly ? getMonthlyAwardSeasons(playerId) : getAwardSeasons(playerId);
      const overallData = enrichment.overallByPlayer.get(playerId);

      return {
        ...base,
        awards: countAwards(awardSeasons, "active"),
        awardSeasons,
        seasonPosition: isMonthly || isLatest ? seasonPositions.get(playerId) || generalBase.length + 1 : index + 1,
        positionChange: isMonthly ? null : previousPosition ? previousPosition - (index + 1) : null,
        overall: overallData?.overall ?? null,
        overallTrend: overallData?.trend ?? null,
        overallPositions: overallData?.positions ?? null,
        overallPositionTrends: overallData?.positionTrends ?? null,
        overallGoalkeeperGames: overallData?.goalkeeperGames ?? 0,
        overallGoalkeeperRounds: overallData?.goalkeeperRounds ?? 0,
        speedRating: enrichment.speedByPlayer.get(playerId) ?? null,
        fitness: getFitness(playerId),
        achievementBelts: enrichment.achievementBeltsByPlayer.get(playerId) || [],
        cosmetics: enrichment.cosmeticsByPlayer.get(playerId) || null,
      };
    };

    const general = generalBase.map((entry, index) => buildFullEntry(entry, index));
    const generalByPlayer = new Map(general.map((e) => [e.player.id, e]));

    const latestEntries = latestBase.map((entry) => {
      const full = buildFullEntry(entry, 0, false, true);
      full.positionChange = generalByPlayer.get(entry.player.id)?.positionChange ?? null;
      return full;
    });

    const monthlyEntries = monthlyBase.map((entry) => buildFullEntry(entry, 0, true, false));

    const [monthlyYearStr, monthlyMonthStr] = monthlyKey.split("-");
    const monthlyYear = Number(monthlyYearStr) || new Date().getFullYear();
    const monthlyMonth = Number(monthlyMonthStr) || 1;
    const monthlyLabel = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(Date.UTC(monthlyYear, monthlyMonth - 1, 15)));

    return {
      seasonLabel,
      general,
      monthly: {
        key: monthlyKey,
        label: monthlyLabel.charAt(0).toUpperCase() + monthlyLabel.slice(1),
        entries: monthlyEntries,
      },
      latestRound: {
        id: latestRound.id,
        number: latestRound.number,
        date: latestRound.date,
        entries: latestEntries,
      },
    };
  }

  async getGeneralRanking(actor: Actor, leagueId: string): Promise<RankingEntry[]> {
    const experience = await this.getSeasonRankingExperience(actor, leagueId, { includeEnrichment: true });
    return experience.general;
  }

  async getPlayerRankingEntry(
    actor: Actor,
    leagueId: string,
    playerId: string,
  ): Promise<{ entry: RankingEntry; position: number } | null> {
    const experience = await this.getSeasonRankingExperience(actor, leagueId, { includeEnrichment: true });
    const index = experience.general.findIndex((item) => item.player.id === playerId);
    if (index >= 0) {
      const entry = experience.general[index];
      if (entry) {
        return {
          entry,
          position: index + 1,
        };
      }
    }

    const player = await this.repository.findLeaguePlayer(actor, leagueId, playerId);
    if (!player) return null;

    const cosmetics = await this.repository.findPlayerCosmetics(actor, playerId);

    const emptyEntry: RankingEntry = {
      player,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      points: 0,
      legacyPoints: 0,
      positionBonus: 0,
      overall: null,
      overallTrend: null,
      overallPositions: null,
      overallPositionTrends: null,
      overallGoalkeeperGames: 0,
      overallGoalkeeperRounds: 0,
      speedRating: null,
      winRate: 0,
      awards: { roundMvp: 0, topScorer: 0, topAssister: 0, kingOfWins: 0 },
      awardSeasons: [],
      seasonPosition: experience.general.length + 1,
      positionChange: null,
      fitness: null,
      cosmetics: cosmetics || null,
      achievementBelts: [],
    };

    return {
      entry: emptyEntry,
      position: experience.general.length + 1,
    };
  }

  async getRankingEnrichmentForPlayers(
    actor: Actor,
    leagueId: string,
    playerIds: string[],
  ): Promise<Record<string, RankingEnrichment>> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const requested = [...new Set(playerIds)].filter((id) => uuidRegex.test(id)).slice(0, 150);
    if (!requested.length) return {};

    const activeSeason = await this.repository.findActiveSeason(actor, leagueId);
    if (!activeSeason) return {};

    const rounds = await this.repository.findFinishedOfficialRounds(actor, [activeSeason.id]);
    const roundIds = rounds.map((r) => r.id);

    const enrichment = await this.repository.findEnrichmentData(
      actor,
      leagueId,
      activeSeason.id,
      roundIds,
      requested,
    );

    const fitnessByPlayer = new Map<string, { distanceKm: number; speedTotal: number; entries: number }>();
    for (const row of enrichment.fitnessRows) {
      const current = fitnessByPlayer.get(row.player_id) || { distanceKm: 0, speedTotal: 0, entries: 0 };
      current.distanceKm += Number(row.distance_km || 0);
      current.speedTotal += Number(row.average_speed_kmh || 0);
      current.entries += 1;
      fitnessByPlayer.set(row.player_id, current);
    }

    const result: Record<string, RankingEnrichment> = {};
    for (const id of requested) {
      const overallData = enrichment.overallByPlayer.get(id);
      const fitness = fitnessByPlayer.get(id);

      result[id] = {
        overall: overallData?.overall ?? null,
        overallTrend: overallData?.trend ?? null,
        overallPositions: overallData?.positions ?? null,
        overallPositionTrends: overallData?.positionTrends ?? null,
        overallGoalkeeperGames: overallData?.goalkeeperGames ?? 0,
        overallGoalkeeperRounds: overallData?.goalkeeperRounds ?? 0,
        speedRating: enrichment.speedByPlayer.get(id) ?? null,
        fitness: fitness && fitness.entries > 0 ? {
          distanceKm: Math.round(fitness.distanceKm * 100) / 100,
          averageSpeedKmh: Math.round((fitness.speedTotal / fitness.entries) * 100) / 100,
          entries: fitness.entries,
        } : null,
        achievementBelts: enrichment.achievementBeltsByPlayer.get(id) || [],
        cosmetics: enrichment.cosmeticsByPlayer.get(id) || null,
      };
    }

    return result;
  }
}
