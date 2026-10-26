import type { ManagedAccount } from "../domain/account-access";

type ApiErrorPayload = { message?: unknown };

export class IdentityApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "IdentityApiError";
  }
}

export type IdentityHttpGateway = {
  listManagedAccounts(): Promise<ManagedAccount[]>;
  setAccountAdminRole(userId: string, makeAdmin: boolean): Promise<"admin" | "player">;
};

function apiUrl(baseUrl: string, path: string): URL {
  try {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("invalid protocol");
    return new URL(path.replace(/^\//, ""), base);
  } catch {
    throw new IdentityApiError("Endereço da API de identidade inválido.");
  }
}

async function errorFrom(response: Response): Promise<IdentityApiError> {
  const payload: ApiErrorPayload | null = await response.json().catch(() => null);
  return new IdentityApiError(
    typeof payload?.message === "string" ? payload.message : "Não foi possível concluir a operação de acesso.",
    response.status,
  );
}

export function httpIdentityGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): IdentityHttpGateway {
  if (!accessToken.trim()) throw new IdentityApiError("Sessão expirada. Entre novamente.");

  const request = async (method: "GET" | "PATCH", path: string, body?: object) => {
    let response: Response;
    try {
      response = await fetcher(apiUrl(baseUrl, path), {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      if (error instanceof IdentityApiError) throw error;
      throw new IdentityApiError("A API de identidade não respondeu.");
    }
    if (!response.ok) throw await errorFrom(response);
    return response;
  };

  return {
    async listManagedAccounts() {
      const response = await request("GET", "api/identity/accounts");
      const payload = await response.json().catch(() => null) as { accounts?: unknown } | null;
      if (!Array.isArray(payload?.accounts)) {
        throw new IdentityApiError("Resposta inválida ao carregar as contas.", response.status);
      }
      return payload.accounts as ManagedAccount[];
    },
    async setAccountAdminRole(userId, makeAdmin) {
      const response = await request(
        "PATCH", `api/identity/accounts/${encodeURIComponent(userId)}/role`, { admin: makeAdmin },
      );
      const payload = await response.json().catch(() => null) as { role?: unknown } | null;
      if (payload?.role !== "admin" && payload?.role !== "player") {
        throw new IdentityApiError("Resposta inválida ao alterar o acesso.", response.status);
      }
      return payload.role;
    },
  };
}
