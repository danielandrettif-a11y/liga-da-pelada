import type { AccountCareer, AccountCareerRow, CareerTotals } from "../domain/account-career";
import type { CreatePlayerInput } from "@/lib/types";
import type { PrivateBalanceTag } from "@/lib/types";
import type { FitnessRoundEntry, FitnessSummaries, FitnessSummary } from "../domain/fitness";
import type { SpeedDrawCommand, SpeedDrawResult, SpeedRating } from "../domain/speed-rating";
import type { RosterUnreadState, UnreadRosterPlayers } from "../domain/roster-activity";
import { isRosterPlayer, type RosterPlayer } from "../domain/player-catalog";
import {
  isRosterGroups,
  isRosterPlayerStatistics,
  type RosterGroups,
  type RosterPlayerStatistics,
  type RosterStatisticsRoundType,
} from "../domain/player-statistics";
import { isImportedGuest, type ImportedGuest } from "../domain/player-management";
import { isPlayerRegistrationEvent } from "../domain/roster-registration";
import type { PlayerRegistrationEvent } from "@/lib/types";
import {
  isPlayerClubGoals,
  isPlayerPlaytime,
  type PlayerClubGoals,
  type PlayerPlaytime,
} from "../domain/player-profile-performance";
import {
  isMonthlyAward,
  isMonthlyAwardWinner,
  isPlayerAchievementBelt,
  type MonthlyAward,
  type MonthlyAwardWinner,
  type PlayerAchievementBelt,
} from "../domain/player-awards";
import {
  isPlayerAwardSeason,
  isPlayerRoundHistory,
  type PlayerAwardSeason,
  type PlayerHistoryRoundType,
  type PlayerRoundHistory,
} from "../domain/player-history";

type ApiErrorPayload = { message?: unknown };

export class RosterApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "RosterApiError";
  }
}

export type RosterHttpGateway = {
  getMyAccountCareer(): Promise<AccountCareer>;
  getPlayerPrivateBalanceTag(playerId: string): Promise<{ allowed: boolean; tag: PrivateBalanceTag | null }>;
  setPlayerPrivateBalanceTag(playerId: string, tag: PrivateBalanceTag | null): Promise<void>;
  getMyFitnessRounds(playerId: string, leagueId: string): Promise<FitnessRoundEntry[]>;
  saveMyFitness(roundId: string, distance: number, pace: number): Promise<string>;
  setFitnessVisibility(visible: boolean): Promise<string>;
  getPlayerFitnessSummaries(playerId: string, leagueId: string): Promise<FitnessSummaries | null>;
  getPlayerSpeedRatings(leagueId: string): Promise<Record<string, SpeedRating | null>>;
  setPlayerSpeedRating(leagueId: string, playerId: string, rating: SpeedRating | null): Promise<void>;
  drawTeamsBySpeed(leagueId: string, command: SpeedDrawCommand): Promise<SpeedDrawResult>;
  getRosterUnreadState(leagueId: string): Promise<RosterUnreadState>;
  getUnreadRosterPlayers(leagueId: string): Promise<UnreadRosterPlayers>;
  markRosterActivitySeenThrough(leagueId: string, seenThrough: string): Promise<void>;
  markRosterActivitySeen(leagueId: string): Promise<void>;
  getPlayers(leagueId: string, selectableOnly?: boolean): Promise<RosterPlayer[]>;
  getPlayer(leagueId: string, playerId: string): Promise<RosterPlayer | null>;
  getPlayersWithStats(
    leagueId: string, roundType: RosterStatisticsRoundType, selectableOnly?: boolean,
  ): Promise<RosterPlayerStatistics[]>;
  getRosterGroups(leagueId: string, roundType: RosterStatisticsRoundType): Promise<RosterGroups>;
  createPlayer(leagueId: string, input: CreatePlayerInput): Promise<RosterPlayer>;
  updatePlayer(leagueId: string, playerId: string, input: Partial<CreatePlayerInput>): Promise<RosterPlayer>;
  swapPlayerAvatars(leagueId: string, playerId: string): Promise<void>;
  importGuestRoster(leagueId: string, names: string[]): Promise<ImportedGuest[]>;
  getRegistrationHistory(leagueId: string): Promise<PlayerRegistrationEvent[]>;
  getRegisteredMergeCandidates(leagueId: string, guestId: string): Promise<RosterPlayer[]>;
  getPlayerPlaytime(leagueId: string, playerId: string): Promise<PlayerPlaytime>;
  getPlayerGoalsByClub(leagueId: string, playerId: string): Promise<PlayerClubGoals[]>;
  getPlayerMonthlyAwards(leagueId: string, playerId: string): Promise<MonthlyAward[]>;
  getPlayerAchievementBelts(leagueId: string, playerId: string): Promise<PlayerAchievementBelt[]>;
  getMonthlyAwardWinners(leagueId: string, periodStart: string): Promise<MonthlyAwardWinner[]>;
  getPlayerRoundHistory(
    leagueId: string, playerId: string, roundType: PlayerHistoryRoundType,
  ): Promise<PlayerRoundHistory[]>;
  getPlayerAwardSeasons(leagueId: string, playerId: string): Promise<PlayerAwardSeason[]>;
};

const totalFields = [
  "rounds_count", "games", "goals", "assists", "wins", "draws", "losses", "points",
  "goalkeeper_games", "goals_conceded", "clean_sheets", "play_seconds",
] as const satisfies readonly (keyof CareerTotals)[];

function apiUrl(baseUrl: string, path: string): URL {
  try {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("invalid protocol");
    return new URL(path.replace(/^\//, ""), base);
  } catch {
    throw new RosterApiError("Endereço da API de elenco inválido.");
  }
}

function isTotals(value: unknown): value is CareerTotals {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return totalFields.every((field) => typeof record[field] === "number" && Number.isFinite(record[field]));
}

function isRow(value: unknown): value is AccountCareerRow {
  if (!isTotals(value)) return false;
  const row = value as unknown as Record<string, unknown>;
  return typeof row.league_id === "string" && typeof row.league_name === "string"
    && (row.round_type === "official" || row.round_type === "friendly");
}

function isCareer(value: unknown): value is AccountCareer {
  if (!value || typeof value !== "object") return false;
  const career = value as Record<string, unknown>;
  return Array.isArray(career.rows) && career.rows.every(isRow)
    && isTotals(career.overall) && isTotals(career.official) && isTotals(career.friendly);
}

function isFitnessSummary(value: unknown): value is FitnessSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return ["distanceKm", "averageSpeedKmh", "metersPerMinute", "entries"]
    .every((field) => typeof summary[field] === "number" && Number.isFinite(summary[field]));
}

function isFitnessRound(value: unknown): value is FitnessRoundEntry {
  if (!value || typeof value !== "object") return false;
  const round = value as Record<string, unknown>;
  if (typeof round.roundId !== "string" || typeof round.number !== "number" || typeof round.date !== "string"
    || (round.roundType !== "official" && round.roundType !== "friendly")) return false;
  if (round.fitness === null) return true;
  if (!round.fitness || typeof round.fitness !== "object") return false;
  const fitness = round.fitness as Record<string, unknown>;
  return typeof fitness.id === "string" && typeof fitness.player_id === "string"
    && typeof fitness.round_id === "string" && typeof fitness.distance_km === "number"
    && typeof fitness.average_speed_kmh === "number" && typeof fitness.created_at === "string"
    && typeof fitness.updated_at === "string";
}

function isSpeedSummary(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  if (typeof summary.average !== "number" || !Number.isFinite(summary.average)
    || !summary.stars || typeof summary.stars !== "object") return false;
  const stars = summary.stars as Record<string, unknown>;
  return ["1", "2", "3"].every((key) => Number.isInteger(stars[key]) && Number(stars[key]) >= 0);
}

function isSpeedDrawResult(value: unknown): value is SpeedDrawResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return Array.isArray(result.teams)
    && result.teams.every((team) => Array.isArray(team) && team.every((id) => typeof id === "string"))
    && Array.isArray(result.teamSummaries) && result.teamSummaries.every(isSpeedSummary)
    && Number.isInteger(result.unratedCount) && Number(result.unratedCount) >= 0
    && Array.isArray(result.attendanceOrder) && result.attendanceOrder.every((id) => typeof id === "string");
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

async function errorFrom(response: Response): Promise<RosterApiError> {
  const payload: ApiErrorPayload | null = await response.json().catch(() => null);
  return new RosterApiError(
    typeof payload?.message === "string" ? payload.message : "Não foi possível acessar o elenco.",
    response.status,
  );
}

export function httpRosterGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): RosterHttpGateway {
  if (!accessToken.trim()) throw new RosterApiError("Sessão expirada. Entre novamente.");

  const request = async (method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: object) => {
    const url = apiUrl(baseUrl, path);
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new RosterApiError("A API de elenco não respondeu.");
    }
    if (!response.ok) throw await errorFrom(response);
    return response;
  };

  return {
    async getMyAccountCareer() {
      const response = await request("GET", "api/roster/me/career");
      const payload: unknown = await response.json().catch(() => null);
      if (!isCareer(payload)) throw new RosterApiError("Resposta inválida ao carregar a carreira.", response.status);
      return payload;
    },
    async getPlayerPrivateBalanceTag(playerId) {
      const response = await request(
        "GET", `api/roster/players/${encodeURIComponent(playerId)}/private-balance-tag`,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || typeof (payload as { allowed?: unknown }).allowed !== "boolean") {
        throw new RosterApiError("Resposta inválida ao carregar a classificação.", response.status);
      }
      const result = payload as { allowed: boolean; tag?: unknown };
      if (result.tag !== null && result.tag !== "bagre_1" && result.tag !== "bagre_2"
        && result.tag !== "craque_1" && result.tag !== "craque_2") {
        throw new RosterApiError("Resposta inválida ao carregar a classificação.", response.status);
      }
      return { allowed: result.allowed, tag: result.tag as PrivateBalanceTag | null };
    },
    async setPlayerPrivateBalanceTag(playerId, tag) {
      await request(
        "PUT", `api/roster/players/${encodeURIComponent(playerId)}/private-balance-tag`, { tag },
      );
    },
    async getMyFitnessRounds(playerId, leagueId) {
      const response = await request(
        "GET",
        `api/roster/players/${encodeURIComponent(playerId)}/fitness-rounds?league_id=${encodeURIComponent(leagueId)}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const rounds = payload && typeof payload === "object" ? (payload as { rounds?: unknown }).rounds : null;
      if (!Array.isArray(rounds) || !rounds.every(isFitnessRound)) {
        throw new RosterApiError("Resposta inválida ao carregar os dados físicos.", response.status);
      }
      return rounds;
    },
    async saveMyFitness(roundId, distance, pace) {
      const response = await request(
        "PUT", `api/roster/rounds/${encodeURIComponent(roundId)}/my-fitness`, { distance, pace },
      );
      const payload: unknown = await response.json().catch(() => null);
      const playerId = payload && typeof payload === "object" ? (payload as { player_id?: unknown }).player_id : null;
      if (typeof playerId !== "string" || !playerId) {
        throw new RosterApiError("Resposta inválida ao salvar os dados físicos.", response.status);
      }
      return playerId;
    },
    async setFitnessVisibility(visible) {
      const response = await request("PATCH", "api/roster/me/fitness-visibility", { visible });
      const payload: unknown = await response.json().catch(() => null);
      const playerId = payload && typeof payload === "object" ? (payload as { player_id?: unknown }).player_id : null;
      if (typeof playerId !== "string" || !playerId) {
        throw new RosterApiError("Resposta inválida ao alterar a privacidade.", response.status);
      }
      return playerId;
    },
    async getPlayerFitnessSummaries(playerId, leagueId) {
      const response = await request(
        "GET",
        `api/roster/players/${encodeURIComponent(playerId)}/fitness-summary?league_id=${encodeURIComponent(leagueId)}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || !("summaries" in payload)) {
        throw new RosterApiError("Resposta inválida ao carregar o resumo físico.", response.status);
      }
      const summaries = (payload as { summaries: unknown }).summaries;
      if (summaries === null) return null;
      if (!summaries || typeof summaries !== "object") {
        throw new RosterApiError("Resposta inválida ao carregar o resumo físico.", response.status);
      }
      const result = summaries as { official?: unknown; friendly?: unknown };
      if (!isFitnessSummary(result.official) || !isFitnessSummary(result.friendly)) {
        throw new RosterApiError("Resposta inválida ao carregar o resumo físico.", response.status);
      }
      return { official: result.official, friendly: result.friendly };
    },
    async getPlayerSpeedRatings(leagueId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/speed-ratings`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const ratings = payload && typeof payload === "object"
        ? (payload as { ratings?: unknown }).ratings : null;
      if (!ratings || typeof ratings !== "object" || Array.isArray(ratings)
        || !Object.values(ratings).every((value) => value === null || value === 1 || value === 2 || value === 3)) {
        throw new RosterApiError("Resposta inválida ao carregar as velocidades.", response.status);
      }
      return ratings as Record<string, SpeedRating | null>;
    },
    async setPlayerSpeedRating(leagueId, playerId, rating) {
      await request(
        "PUT",
        `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/speed-rating`,
        { rating },
      );
    },
    async drawTeamsBySpeed(leagueId, command) {
      const response = await request(
        "POST", `api/roster/leagues/${encodeURIComponent(leagueId)}/speed-draw`, command,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!isSpeedDrawResult(payload)) {
        throw new RosterApiError("Resposta inválida ao sortear os times.", response.status);
      }
      return payload;
    },
    async getRosterUnreadState(leagueId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/activity/unread-state`,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        throw new RosterApiError("Resposta inválida ao carregar as novidades do elenco.", response.status);
      }
      const state = payload as Record<string, unknown>;
      if (!Number.isInteger(state.count) || Number(state.count) < 0 || !isNullableTimestamp(state.lastSeenAt)) {
        throw new RosterApiError("Resposta inválida ao carregar as novidades do elenco.", response.status);
      }
      return { count: Number(state.count), lastSeenAt: state.lastSeenAt };
    },
    async getUnreadRosterPlayers(leagueId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/activity/unread-players`,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        throw new RosterApiError("Resposta inválida ao carregar os novos jogadores.", response.status);
      }
      const state = payload as Record<string, unknown>;
      if (!Array.isArray(state.playerIds) || !state.playerIds.every((id) => typeof id === "string")
        || !isNullableTimestamp(state.seenThrough)) {
        throw new RosterApiError("Resposta inválida ao carregar os novos jogadores.", response.status);
      }
      return { playerIds: state.playerIds, seenThrough: state.seenThrough };
    },
    async markRosterActivitySeenThrough(leagueId, seenThrough) {
      await request(
        "PUT", `api/roster/leagues/${encodeURIComponent(leagueId)}/activity/read-through`, { seenThrough },
      );
    },
    async markRosterActivitySeen(leagueId) {
      await request("PUT", `api/roster/leagues/${encodeURIComponent(leagueId)}/activity/read`);
    },
    async getPlayers(leagueId, selectableOnly = false) {
      const response = await request(
        "GET",
        `api/roster/leagues/${encodeURIComponent(leagueId)}/players?selectable_only=${selectableOnly}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const players = payload && typeof payload === "object" ? (payload as { players?: unknown }).players : null;
      if (!Array.isArray(players) || !players.every(isRosterPlayer)) {
        throw new RosterApiError("Resposta inválida ao carregar os jogadores.", response.status);
      }
      return players;
    },
    async getPlayer(leagueId, playerId) {
      const response = await request(
        "GET",
        `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const player = payload && typeof payload === "object" ? (payload as { player?: unknown }).player : undefined;
      if (player === null) return null;
      if (!isRosterPlayer(player)) {
        throw new RosterApiError("Resposta inválida ao carregar o jogador.", response.status);
      }
      return player;
    },
    async getPlayersWithStats(leagueId, roundType, selectableOnly = false) {
      const response = await request(
        "GET",
        `api/roster/leagues/${encodeURIComponent(leagueId)}/player-statistics?round_type=${encodeURIComponent(roundType)}&selectable_only=${selectableOnly}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const players = payload && typeof payload === "object" ? (payload as { players?: unknown }).players : null;
      if (!Array.isArray(players) || !players.every(isRosterPlayerStatistics)) {
        throw new RosterApiError("Resposta inválida ao carregar as estatísticas do elenco.", response.status);
      }
      return players;
    },
    async getRosterGroups(leagueId, roundType) {
      const response = await request(
        "GET",
        `api/roster/leagues/${encodeURIComponent(leagueId)}/roster-groups?round_type=${encodeURIComponent(roundType)}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!isRosterGroups(payload)) {
        throw new RosterApiError("Resposta inválida ao carregar os grupos do elenco.", response.status);
      }
      return payload;
    },
    async createPlayer(leagueId, input) {
      const response = await request(
        "POST", `api/roster/leagues/${encodeURIComponent(leagueId)}/players`, input,
      );
      const payload: unknown = await response.json().catch(() => null);
      const player = payload && typeof payload === "object" ? (payload as { player?: unknown }).player : null;
      if (!isRosterPlayer(player)) {
        throw new RosterApiError("Resposta inválida ao criar o jogador.", response.status);
      }
      return player;
    },
    async updatePlayer(leagueId, playerId, input) {
      const response = await request(
        "PATCH", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}`, input,
      );
      const payload: unknown = await response.json().catch(() => null);
      const player = payload && typeof payload === "object" ? (payload as { player?: unknown }).player : null;
      if (!isRosterPlayer(player)) {
        throw new RosterApiError("Resposta inválida ao atualizar o jogador.", response.status);
      }
      return player;
    },
    async swapPlayerAvatars(leagueId, playerId) {
      await request(
        "POST", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/swap-avatars`,
      );
    },
    async importGuestRoster(leagueId, names) {
      const response = await request(
        "POST", `api/roster/leagues/${encodeURIComponent(leagueId)}/guest-imports`, { names },
      );
      const payload: unknown = await response.json().catch(() => null);
      const guests = payload && typeof payload === "object" ? (payload as { guests?: unknown }).guests : null;
      if (!Array.isArray(guests) || !guests.every(isImportedGuest)) {
        throw new RosterApiError("Resposta inválida ao importar os convidados.", response.status);
      }
      return guests;
    },
    async getRegistrationHistory(leagueId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/registrations`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const events = payload && typeof payload === "object" ? (payload as { events?: unknown }).events : null;
      if (!Array.isArray(events) || !events.every(isPlayerRegistrationEvent)) {
        throw new RosterApiError("Resposta inválida ao carregar o histórico de cadastros.", response.status);
      }
      return events;
    },
    async getRegisteredMergeCandidates(leagueId, guestId) {
      const response = await request(
        "GET",
        `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(guestId)}/merge-candidates`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const players = payload && typeof payload === "object" ? (payload as { players?: unknown }).players : null;
      if (!Array.isArray(players) || !players.every(isRosterPlayer)) {
        throw new RosterApiError("Resposta inválida ao carregar os candidatos à união.", response.status);
      }
      return players;
    },
    async getPlayerPlaytime(leagueId, playerId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/playtime`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const playtime = payload && typeof payload === "object" ? (payload as { playtime?: unknown }).playtime : null;
      if (!isPlayerPlaytime(playtime)) {
        throw new RosterApiError("Resposta inválida ao carregar o tempo em campo.", response.status);
      }
      return playtime;
    },
    async getPlayerGoalsByClub(leagueId, playerId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/club-goals`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const clubs = payload && typeof payload === "object" ? (payload as { clubs?: unknown }).clubs : null;
      if (!Array.isArray(clubs) || !clubs.every(isPlayerClubGoals)) {
        throw new RosterApiError("Resposta inválida ao carregar os gols por clube.", response.status);
      }
      return clubs;
    },
    async getPlayerMonthlyAwards(leagueId, playerId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/monthly-awards`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const awards = payload && typeof payload === "object" ? (payload as { awards?: unknown }).awards : null;
      if (!Array.isArray(awards) || !awards.every(isMonthlyAward)) {
        throw new RosterApiError("Resposta inválida ao carregar os prêmios mensais.", response.status);
      }
      return awards;
    },
    async getPlayerAchievementBelts(leagueId, playerId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/achievement-belts`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const belts = payload && typeof payload === "object" ? (payload as { belts?: unknown }).belts : null;
      if (!Array.isArray(belts) || !belts.every(isPlayerAchievementBelt)) {
        throw new RosterApiError("Resposta inválida ao carregar os cinturões.", response.status);
      }
      return belts;
    },
    async getMonthlyAwardWinners(leagueId, periodStart) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/monthly-awards/winners?period_start=${encodeURIComponent(periodStart)}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const winners = payload && typeof payload === "object" ? (payload as { winners?: unknown }).winners : null;
      if (!Array.isArray(winners) || !winners.every(isMonthlyAwardWinner)) {
        throw new RosterApiError("Resposta inválida ao carregar os vencedores mensais.", response.status);
      }
      return winners;
    },
    async getPlayerRoundHistory(leagueId, playerId, roundType) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/round-history?round_type=${encodeURIComponent(roundType)}`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const history = payload && typeof payload === "object" ? (payload as { history?: unknown }).history : null;
      if (!Array.isArray(history) || !history.every(isPlayerRoundHistory)) {
        throw new RosterApiError("Resposta inválida ao carregar o histórico por rodada.", response.status);
      }
      return history;
    },
    async getPlayerAwardSeasons(leagueId, playerId) {
      const response = await request(
        "GET", `api/roster/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/award-seasons`,
      );
      const payload: unknown = await response.json().catch(() => null);
      const seasons = payload && typeof payload === "object" ? (payload as { seasons?: unknown }).seasons : null;
      if (!Array.isArray(seasons) || !seasons.every(isPlayerAwardSeason)) {
        throw new RosterApiError("Resposta inválida ao carregar as insígnias por temporada.", response.status);
      }
      return seasons;
    },
  };
}
