import type { NewLeague } from "../domain/league-creation";
import { DuplicateLeagueNameError, type LeagueCreator } from "../application/create-league";
import type { RoundType, Season, SeasonSummary, Stadium } from "@/lib/types";

type ApiErrorPayload = { message?: unknown };

export class LeagueApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "LeagueApiError";
  }
}

export type LeagueHttpGateway = LeagueCreator & {
  createQuickMatch(input: QuickMatchInput): Promise<QuickMatchSession>;
  getConfig(leagueId: string): Promise<LeagueConfig>;
  requestMembership(leagueId: string): Promise<void>;
  joinOpen(leagueId: string): Promise<void>;
  setFavorite(leagueId: string, favorite: boolean): Promise<void>;
  requestByInvite(inviteToken: string): Promise<void>;
  reviewMembership(requestId: string, approve: boolean): Promise<void>;
  addExistingAccount(leagueId: string, userId: string): Promise<void>;
  setVisibility(leagueId: string, visibility: "private" | "open"): Promise<void>;
  updateName(leagueId: string, name: string): Promise<{ name: string }>;
  updateSettings(leagueId: string, settings: LeagueSettingsInput): Promise<void>;
  setPreseason(leagueId: string, enabled: boolean): Promise<void>;
  upgrade(leagueId: string): Promise<void>;
  deleteLeague(leagueId: string, confirmName: string): Promise<void>;
  getActiveSeason(leagueId: string): Promise<Season | null>;
  getActiveSeasonRoundIds(leagueId: string, roundType: RoundType): Promise<string[]>;
  getLatestFinishedSeason(leagueId: string): Promise<SeasonSummary | null>;
  finishSeason(leagueId: string, confirmation: string): Promise<{ summary: SeasonSummary; newSeasonNumber: number }>;
  getStadiums(leagueId: string): Promise<Stadium[]>;
  saveStadium(leagueId: string, input: StadiumApiInput): Promise<Stadium>;
  deleteStadium(leagueId: string, stadiumId: string): Promise<void>;
  reorderStadiums(leagueId: string, stadiumIds: string[]): Promise<void>;
};

export type QuickMatchInput = { date: string; start_time: string; field_name: string; map_url: string };
export type QuickMatchSession = { league_id: string; callup_id: string; round_id: string };

export type StadiumApiInput = {
  id?: string | null;
  name: string;
  address: string | null;
  google_maps_url: string;
  latitude: number | null;
  longitude: number | null;
};

export type LeagueConfig = {
  id: string;
  name: string;
  match_duration: number;
  players_per_team: number;
  teams_per_round: number;
  preseason_enabled: boolean;
  stadium_name: string | null;
  stadium_map_url: string | null;
  event_duration_minutes: number;
  visibility: "private" | "open";
  logo_url: string | null;
  cover_url: string | null;
  accent_color: string;
  can_manage: boolean;
};

export type LeagueSettingsInput = {
  match_duration: number;
  players_per_team: number;
  teams_per_round: number;
  stadium_name: string;
  stadium_map_url: string;
  event_duration_minutes: number;
};

function apiUrl(baseUrl: string, path: string): URL {
  try {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("invalid protocol");
    return new URL(path.replace(/^\//, ""), base);
  } catch {
    throw new LeagueApiError("Endereço da API de peladas inválido.");
  }
}

async function errorFrom(response: Response): Promise<LeagueApiError> {
  const payload: ApiErrorPayload | null = await response.json().catch(() => null);
  const message = typeof payload?.message === "string"
    ? payload.message
    : "Não foi possível concluir a operação na pelada.";
  return new LeagueApiError(message, response.status);
}

export function httpLeagueGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): LeagueHttpGateway {
  if (!accessToken.trim()) throw new LeagueApiError("Sessão expirada. Entre novamente.");

  const request = async (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: object) => {
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
      throw new LeagueApiError("A API de peladas não respondeu.");
    }
    if (!response.ok) throw await errorFrom(response);
    return response;
  };

  return {
    async createQuickMatch(input) {
      const response = await request("POST", "api/quick-match-sessions", input);
      const payload = await response.json().catch(() => null) as Partial<QuickMatchSession> | null;
      if (!payload || !payload.league_id || !payload.callup_id || !payload.round_id) {
        throw new LeagueApiError("Resposta inválida ao criar a partida rápida.", response.status);
      }
      return payload as QuickMatchSession;
    },
    async getConfig(leagueId) {
      const response = await request("GET", `api/leagues/${encodeURIComponent(leagueId)}/config`);
      const payload = await response.json().catch(() => null) as LeagueConfig | null;
      if (!payload || typeof payload.id !== "string" || typeof payload.name !== "string"
        || typeof payload.can_manage !== "boolean") {
        throw new LeagueApiError("Resposta inválida ao carregar a pelada.", response.status);
      }
      return payload;
    },
    async create(league: NewLeague) {
      const response = await request("POST", "api/leagues", league);
      const payload = await response.json().catch(() => null) as { league_id?: unknown } | null;
      if (typeof payload?.league_id !== "string" || !payload.league_id) {
        throw new LeagueApiError("Resposta inválida ao criar a pelada.", response.status);
      }
      return payload.league_id;
    },
    async requestMembership(leagueId) {
      await request("POST", `api/leagues/${encodeURIComponent(leagueId)}/membership-requests`);
    },
    async joinOpen(leagueId) {
      await request("POST", `api/leagues/${encodeURIComponent(leagueId)}/memberships`);
    },
    async setFavorite(leagueId, favorite) {
      await request("PATCH", `api/leagues/${encodeURIComponent(leagueId)}/favorite`, { favorite });
    },
    async requestByInvite(inviteToken) {
      await request("POST", `api/league-invites/${encodeURIComponent(inviteToken)}/membership-requests`);
    },
    async reviewMembership(requestId, approve) {
      await request("POST", `api/league-membership-requests/${encodeURIComponent(requestId)}/review`, { approve });
    },
    async addExistingAccount(leagueId, userId) {
      await request("POST", `api/leagues/${encodeURIComponent(leagueId)}/members`, { user_id: userId });
    },
    async setVisibility(leagueId, visibility) {
      await request("PATCH", `api/leagues/${encodeURIComponent(leagueId)}/visibility`, { visibility });
    },
    async updateName(leagueId, name) {
      const response = await request("PATCH", `api/leagues/${encodeURIComponent(leagueId)}/name`, { name });
      const payload = await response.json().catch(() => null) as { name?: unknown } | null;
      if (typeof payload?.name !== "string" || !payload.name) {
        throw new LeagueApiError("Resposta inválida ao alterar o nome.", response.status);
      }
      return { name: payload.name };
    },
    async updateSettings(leagueId, settings) {
      await request("PATCH", `api/leagues/${encodeURIComponent(leagueId)}/config`, settings);
    },
    async setPreseason(leagueId, enabled) {
      await request("PATCH", `api/leagues/${encodeURIComponent(leagueId)}/preseason`, { enabled });
    },
    async upgrade(leagueId) {
      await request("POST", `api/leagues/${encodeURIComponent(leagueId)}/upgrade`);
    },
    async deleteLeague(leagueId, confirmName) {
      await request("DELETE", `api/leagues/${encodeURIComponent(leagueId)}`, { confirm_name: confirmName });
    },
    async getActiveSeason(leagueId) {
      const response = await request("GET", `api/leagues/${encodeURIComponent(leagueId)}/seasons/active`);
      const payload = await response.json().catch(() => null) as { season?: Season | null } | null;
      if (!payload || !("season" in payload)) {
        throw new LeagueApiError("Resposta inválida ao carregar a temporada.", response.status);
      }
      return payload.season ?? null;
    },
    async getActiveSeasonRoundIds(leagueId, roundType) {
      const response = await request(
        "GET", `api/leagues/${encodeURIComponent(leagueId)}/seasons/active/rounds?round_type=${encodeURIComponent(roundType)}`,
      );
      const payload = await response.json().catch(() => null) as { round_ids?: unknown } | null;
      if (!Array.isArray(payload?.round_ids) || !payload.round_ids.every((id) => typeof id === "string")) {
        throw new LeagueApiError("Resposta inválida ao carregar as rodadas da temporada.", response.status);
      }
      return payload.round_ids as string[];
    },
    async getLatestFinishedSeason(leagueId) {
      const response = await request("GET", `api/leagues/${encodeURIComponent(leagueId)}/seasons/latest-finished`);
      const payload = await response.json().catch(() => null) as { summary?: SeasonSummary | null } | null;
      if (!payload || !("summary" in payload)) {
        throw new LeagueApiError("Resposta inválida ao carregar o histórico da temporada.", response.status);
      }
      return payload.summary ?? null;
    },
    async finishSeason(leagueId, confirmation) {
      const response = await request(
        "POST", `api/leagues/${encodeURIComponent(leagueId)}/seasons/active/finish`, { confirmation },
      );
      const payload = await response.json().catch(() => null) as {
        summary?: SeasonSummary;
        newSeasonNumber?: unknown;
      } | null;
      if (!payload?.summary || !Number.isInteger(payload.newSeasonNumber)) {
        throw new LeagueApiError("Resposta inválida ao terminar a temporada.", response.status);
      }
      return { summary: payload.summary, newSeasonNumber: payload.newSeasonNumber as number };
    },
    async getStadiums(leagueId) {
      const response = await request("GET", `api/leagues/${encodeURIComponent(leagueId)}/stadiums`);
      const payload = await response.json().catch(() => null) as { stadiums?: unknown } | null;
      if (!Array.isArray(payload?.stadiums)
        || !payload.stadiums.every((stadium) => stadium && typeof stadium === "object"
          && typeof (stadium as Stadium).id === "string")) {
        throw new LeagueApiError("Resposta inválida ao carregar os estádios.", response.status);
      }
      return payload.stadiums as Stadium[];
    },
    async saveStadium(leagueId, input) {
      const { id, ...body } = input;
      const path = id
        ? `api/leagues/${encodeURIComponent(leagueId)}/stadiums/${encodeURIComponent(id)}`
        : `api/leagues/${encodeURIComponent(leagueId)}/stadiums`;
      const response = await request(id ? "PATCH" : "POST", path, body);
      const payload = await response.json().catch(() => null) as { stadium?: Stadium } | null;
      if (!payload?.stadium || typeof payload.stadium.id !== "string") {
        throw new LeagueApiError("Resposta inválida ao salvar o estádio.", response.status);
      }
      return payload.stadium;
    },
    async deleteStadium(leagueId, stadiumId) {
      await request(
        "DELETE",
        `api/leagues/${encodeURIComponent(leagueId)}/stadiums/${encodeURIComponent(stadiumId)}`,
      );
    },
    async reorderStadiums(leagueId, stadiumIds) {
      await request("PUT", `api/leagues/${encodeURIComponent(leagueId)}/stadiums/order`, { stadium_ids: stadiumIds });
    },
  };
}

export function asLeagueCreator(gateway: LeagueHttpGateway): LeagueCreator {
  return {
    async create(league) {
      try {
        return await gateway.create(league);
      } catch (error) {
        if (error instanceof LeagueApiError && error.statusCode === 409) {
          throw new DuplicateLeagueNameError();
        }
        throw error;
      }
    },
  };
}
