import type { NewLeague } from "../domain/league-creation";
import { DuplicateLeagueNameError, type LeagueCreator } from "../application/create-league";

type ApiErrorPayload = { message?: unknown };

export class LeagueApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "LeagueApiError";
  }
}

export type LeagueHttpGateway = LeagueCreator & {
  requestMembership(leagueId: string): Promise<void>;
  joinOpen(leagueId: string): Promise<void>;
  setFavorite(leagueId: string, favorite: boolean): Promise<void>;
  requestByInvite(inviteToken: string): Promise<void>;
  reviewMembership(requestId: string, approve: boolean): Promise<void>;
  addExistingAccount(leagueId: string, userId: string): Promise<void>;
  setVisibility(leagueId: string, visibility: "private" | "open"): Promise<void>;
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

  const request = async (method: "POST" | "PATCH", path: string, body?: object) => {
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
