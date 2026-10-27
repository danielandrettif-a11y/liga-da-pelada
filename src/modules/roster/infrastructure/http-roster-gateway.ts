import type { AccountCareer, AccountCareerRow, CareerTotals } from "../domain/account-career";
import type { PrivateBalanceTag } from "@/lib/types";

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

  const request = async (method: "GET" | "PUT", path: string, body?: object) => {
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
  };
}
