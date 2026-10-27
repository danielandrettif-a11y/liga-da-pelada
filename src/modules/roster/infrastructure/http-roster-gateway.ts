import type { AccountCareer, AccountCareerRow, CareerTotals } from "../domain/account-career";
import type { PrivateBalanceTag } from "@/lib/types";
import type { FitnessRoundEntry, FitnessSummaries, FitnessSummary } from "../domain/fitness";

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

  const request = async (method: "GET" | "PUT" | "PATCH", path: string, body?: object) => {
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
  };
}
