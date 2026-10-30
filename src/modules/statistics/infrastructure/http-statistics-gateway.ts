import type { BQBaseScoringSnapshot } from "@/lib/bq-scoring";
import type { ColumnCScoringSettings } from "@/lib/actions/bq-scoring";
import type { RankingEntry, RankingExperienceData } from "@/lib/ranking";
import type { FriendlyStatsEntry, PlayerCardOverall, RoundStatistics } from "@/lib/actions/stats";
import type { ReprocessExecutionResult, ReprocessPreviewResult } from "@/lib/actions/reprocess";
import type { SeasonTeamStanding } from "@/lib/season-team-standings";

export type RankingEnrichment = Pick<
  RankingEntry,
  | "overall"
  | "overallTrend"
  | "overallPositions"
  | "overallPositionTrends"
  | "overallGoalkeeperGames"
  | "overallGoalkeeperRounds"
  | "speedRating"
  | "fitness"
  | "achievementBelts"
  | "cosmetics"
>;

export class StatisticsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "StatisticsApiError";
  }
}

export interface StatisticsGateway {
  getBQScoringRules(leagueId: string): Promise<BQBaseScoringSnapshot>;
  getColumnCScoringRules(leagueId: string): Promise<ColumnCScoringSettings>;
  saveBQScoringRules(
    leagueId: string,
    snapshot: BQBaseScoringSnapshot,
  ): Promise<{ success: boolean; version?: number; error?: string }>;
  saveColumnCScoringRules(
    leagueId: string,
    values: ColumnCScoringSettings,
    options?: { reprocessRanked?: boolean },
  ): Promise<{
    success: boolean;
    error?: string;
    roundsReprocessed?: number;
    playerRoundsReprocessed?: number;
  }>;
  getRanking(leagueId: string): Promise<RankingEntry[]>;
  getRankingExperience(
    leagueId: string,
    options?: { includeEnrichment?: boolean },
  ): Promise<RankingExperienceData>;
  getPlayerRankingEntry(
    leagueId: string,
    playerId: string,
  ): Promise<{ entry: RankingEntry; position: number } | null>;
  getRankingEnrichmentForPlayers(
    leagueId: string,
    playerIds: string[],
  ): Promise<Record<string, RankingEnrichment>>;
  calculateRoundStats(leagueId: string, roundId: string): Promise<{ success: boolean; error?: string }>;
  getRoundStatistics(leagueId: string, roundId: string): Promise<RoundStatistics | null>;
  getFriendlyStats(leagueId: string): Promise<FriendlyStatsEntry[]>;
  getPlayerCardOveralls(leagueId: string): Promise<Record<string, PlayerCardOverall>>;
  getSeasonTeamStandings(leagueId: string): Promise<SeasonTeamStanding[]>;
  previewReprocessSeason(leagueId: string): Promise<ReprocessPreviewResult>;
  executeReprocessSeason(leagueId: string): Promise<ReprocessExecutionResult>;
}

export type StatisticsHttpGateway = StatisticsGateway;

export function httpStatisticsGateway(
  baseUrlOrOptions: string | { baseUrl: string; accessToken?: string },
  maybeToken?: string,
): StatisticsGateway {
  const options =
    typeof baseUrlOrOptions === "string"
      ? { baseUrl: baseUrlOrOptions, accessToken: maybeToken }
      : baseUrlOrOptions;

  const normalizedBase = options.baseUrl.replace(/\/+$/, "");

  function authHeaders(withJson = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (options.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }
    if (withJson) {
      headers["content-type"] = "application/json";
    }
    return headers;
  }

  async function requestJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${normalizedBase}${path}`;
    const response = await fetch(url, init);
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `HTTP ${response.status}`;
      throw new StatisticsApiError(message, response.status);
    }

    return body as T;
  }

  return {
    async getBQScoringRules(leagueId: string): Promise<BQBaseScoringSnapshot> {
      return requestJson<BQBaseScoringSnapshot>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/scoring/bq`,
        {
          headers: authHeaders(),
          cache: "no-store",
        },
      );
    },

    async getColumnCScoringRules(leagueId: string): Promise<ColumnCScoringSettings> {
      return requestJson<ColumnCScoringSettings>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/scoring/column-c`,
        {
          headers: authHeaders(),
          cache: "no-store",
        },
      );
    },

    async saveBQScoringRules(
      leagueId: string,
      snapshot: BQBaseScoringSnapshot,
    ): Promise<{ success: boolean; version?: number; error?: string }> {
      return requestJson<{ success: boolean; version?: number; error?: string }>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/scoring/bq`,
        {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify(snapshot),
        },
      );
    },

    async saveColumnCScoringRules(
      leagueId: string,
      values: ColumnCScoringSettings,
      options?: { reprocessRanked?: boolean },
    ): Promise<{
      success: boolean;
      error?: string;
      roundsReprocessed?: number;
      playerRoundsReprocessed?: number;
    }> {
      return requestJson<{
        success: boolean;
        error?: string;
        roundsReprocessed?: number;
        playerRoundsReprocessed?: number;
      }>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/scoring/column-c`,
        {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify({ settings: values, options }),
        },
      );
    },

    async getRanking(leagueId: string): Promise<RankingEntry[]> {
      return requestJson<RankingEntry[]>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/ranking`,
        {
          headers: authHeaders(),
          cache: "no-store",
        },
      );
    },

    async getRankingExperience(
      leagueId: string,
      options?: { includeEnrichment?: boolean },
    ): Promise<RankingExperienceData> {
      const includeParam = options?.includeEnrichment === false ? "includeEnrichment=false" : "includeEnrichment=true";
      return requestJson<RankingExperienceData>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/ranking/experience?${includeParam}`,
        {
          headers: authHeaders(),
          cache: "no-store",
        },
      );
    },

    async getPlayerRankingEntry(
      leagueId: string,
      playerId: string,
    ): Promise<{ entry: RankingEntry; position: number } | null> {
      try {
        return await requestJson<{ entry: RankingEntry; position: number }>(
          `/api/statistics/leagues/${encodeURIComponent(leagueId)}/ranking/players/${encodeURIComponent(playerId)}`,
          {
            headers: authHeaders(),
            cache: "no-store",
          },
        );
      } catch (err) {
        if (err instanceof StatisticsApiError && err.statusCode === 404) {
          return null;
        }
        throw err;
      }
    },

    async getRankingEnrichmentForPlayers(
      leagueId: string,
      playerIds: string[],
    ): Promise<Record<string, RankingEnrichment>> {
      return requestJson<Record<string, RankingEnrichment>>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/ranking/enrichment`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ playerIds }),
        },
      );
    },

    async calculateRoundStats(leagueId, roundId) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/recalculate`,
        { method: "POST", headers: authHeaders(true) },
      );
    },

    async getRoundStatistics(leagueId, roundId) {
      try {
        return await requestJson<RoundStatistics>(
          `/api/statistics/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}`,
          { headers: authHeaders(), cache: "no-store" },
        );
      } catch (error) {
        if (error instanceof StatisticsApiError && error.statusCode === 404) return null;
        throw error;
      }
    },

    async getFriendlyStats(leagueId) {
      return requestJson<FriendlyStatsEntry[]>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/friendlies`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async getPlayerCardOveralls(leagueId) {
      return requestJson<Record<string, PlayerCardOverall>>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/player-card-overalls`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async getSeasonTeamStandings(leagueId) {
      return requestJson<SeasonTeamStanding[]>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/team-standings`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async previewReprocessSeason(leagueId) {
      return requestJson<ReprocessPreviewResult>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/reprocess/preview`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async executeReprocessSeason(leagueId) {
      return requestJson<ReprocessExecutionResult>(
        `/api/statistics/leagues/${encodeURIComponent(leagueId)}/reprocess`,
        { method: "POST", headers: authHeaders(true) },
      );
    },
  };
}
