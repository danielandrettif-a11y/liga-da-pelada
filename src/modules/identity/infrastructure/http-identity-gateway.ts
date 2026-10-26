import type { ManagedAccount } from "../domain/account-access";

type ApiErrorPayload = { message?: unknown };

export class IdentityApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "IdentityApiError";
  }
}

export type IdentityHttpGateway = {
  signup(input: IdentitySignupInput): Promise<IdentitySignupResult>;
  login(email: string, password: string): Promise<IdentitySession>;
  requestPasswordReset(email: string, pkce: IdentityPkceStart): Promise<void>;
  googleAuthorization(pkce: IdentityPkceStart): Promise<string>;
  exchangePkceCode(code: string, codeVerifier: string): Promise<IdentitySession>;
  updatePassword(password: string): Promise<void>;
  logout(): Promise<void>;
  listManagedAccounts(): Promise<ManagedAccount[]>;
  setAccountAdminRole(userId: string, makeAdmin: boolean): Promise<"admin" | "player">;
};

export type IdentitySession = { accessToken: string; refreshToken: string };
export type IdentityPkceStart = { flowId: string; codeChallenge: string; returnPath: string | null };
export type IdentitySignupInput = IdentityPkceStart & { email: string; password: string; name: string };
export type IdentitySignupResult = { userId: string; requiresConfirmation: boolean; session: IdentitySession | null };

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
  accessToken: string | null = null,
  fetcher: typeof fetch = fetch,
): IdentityHttpGateway {
  const request = async (method: "GET" | "POST" | "PATCH", path: string, body?: object, authenticated = false) => {
    if (authenticated && !accessToken?.trim()) throw new IdentityApiError("Sessão expirada. Entre novamente.");
    let response: Response;
    try {
      response = await fetcher(apiUrl(baseUrl, path), {
        method,
        headers: {
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
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
    async signup(input) {
      const response = await request("POST", "api/identity/signup", {
        email: input.email,
        password: input.password,
        name: input.name,
        flow_id: input.flowId,
        code_challenge: input.codeChallenge,
        return_path: input.returnPath,
      });
      const payload = await response.json().catch(() => null) as {
        user_id?: unknown; requires_confirmation?: unknown; access_token?: unknown; refresh_token?: unknown;
      } | null;
      if (typeof payload?.user_id !== "string" || typeof payload.requires_confirmation !== "boolean") {
        throw new IdentityApiError("Resposta inválida ao criar a conta.", response.status);
      }
      const hasSession = typeof payload.access_token === "string" && typeof payload.refresh_token === "string";
      return {
        userId: payload.user_id,
        requiresConfirmation: payload.requires_confirmation,
        session: hasSession
          ? { accessToken: payload.access_token as string, refreshToken: payload.refresh_token as string }
          : null,
      };
    },
    async login(email, password) {
      const response = await request("POST", "api/identity/login", { email, password });
      return parseSessionResponse(response);
    },
    async requestPasswordReset(email, pkce) {
      await request("POST", "api/identity/password-reset", {
        email, flow_id: pkce.flowId, code_challenge: pkce.codeChallenge, return_path: pkce.returnPath,
      });
    },
    async googleAuthorization(pkce) {
      const response = await request("POST", "api/identity/oauth/google", {
        flow_id: pkce.flowId, code_challenge: pkce.codeChallenge, return_path: pkce.returnPath,
      });
      const payload = await response.json().catch(() => null) as { url?: unknown } | null;
      if (typeof payload?.url !== "string" || !/^https?:\/\//.test(payload.url)) {
        throw new IdentityApiError("Resposta inválida ao iniciar o Google.", response.status);
      }
      return payload.url;
    },
    async exchangePkceCode(code, codeVerifier) {
      const response = await request("POST", "api/identity/pkce/exchange", {
        code, code_verifier: codeVerifier,
      });
      return parseSessionResponse(response);
    },
    async updatePassword(password) {
      await request("PATCH", "api/identity/password", { password }, true);
    },
    async logout() {
      await request("POST", "api/identity/logout", undefined, true);
    },
    async listManagedAccounts() {
      const response = await request("GET", "api/identity/accounts", undefined, true);
      const payload = await response.json().catch(() => null) as { accounts?: unknown } | null;
      if (!Array.isArray(payload?.accounts)) {
        throw new IdentityApiError("Resposta inválida ao carregar as contas.", response.status);
      }
      return payload.accounts as ManagedAccount[];
    },
    async setAccountAdminRole(userId, makeAdmin) {
      const response = await request(
        "PATCH", `api/identity/accounts/${encodeURIComponent(userId)}/role`, { admin: makeAdmin }, true,
      );
      const payload = await response.json().catch(() => null) as { role?: unknown } | null;
      if (payload?.role !== "admin" && payload?.role !== "player") {
        throw new IdentityApiError("Resposta inválida ao alterar o acesso.", response.status);
      }
      return payload.role;
    },
  };
}

async function parseSessionResponse(response: Response): Promise<IdentitySession> {
  const payload = await response.json().catch(() => null) as {
    access_token?: unknown; refresh_token?: unknown;
  } | null;
  if (typeof payload?.access_token !== "string" || typeof payload.refresh_token !== "string") {
    throw new IdentityApiError("Resposta inválida ao iniciar a sessão.", response.status);
  }
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token };
}
