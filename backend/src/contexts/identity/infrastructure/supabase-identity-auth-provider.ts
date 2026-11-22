import type {
  IdentityAuthProvider,
  IdentitySession,
  SignupReceipt,
} from "../application/manage-authentication.js";

type AuthUser = { id?: unknown; identities?: unknown };
type AuthPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  user?: AuthUser | null;
  code?: unknown;
  error_code?: unknown;
  msg?: unknown;
  message?: unknown;
  error_description?: unknown;
};

export class IdentityAuthProviderError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) {
    super(message);
    this.name = "IdentityAuthProviderError";
  }
}

function authUrl(baseUrl: string, path: string): URL {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Auth URL inválida.");
  return url;
}

function errorDetails(payload: AuthPayload | null) {
  const code = String(payload?.code || payload?.error_code || "auth_error");
  const message = String(payload?.msg || payload?.message || payload?.error_description || "");
  return { code, message };
}

function translateFailure(operation: string, status: number, payload: AuthPayload | null): IdentityAuthProviderError {
  const details = errorDetails(payload);
  if (operation === "login") {
    if (details.code === "email_not_confirmed") {
      return new IdentityAuthProviderError(
        "Confirme seu cadastro no e-mail antes de entrar. Confira também a caixa de spam.", 403, details.code,
      );
    }
    if (status === 400 || status === 401 || details.code === "invalid_credentials") {
      return new IdentityAuthProviderError("Email ou senha incorretos.", 401, details.code);
    }
  }
  if (operation === "signup" && /already registered|already exists|user_already_exists/i.test(`${details.code} ${details.message}`)) {
    return new IdentityAuthProviderError("Este e-mail já possui uma conta.", 409, details.code);
  }
  if (status === 429) {
    return new IdentityAuthProviderError("Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429, details.code);
  }
  if (status === 401 || status === 403) {
    return new IdentityAuthProviderError("Sessão expirada. Entre novamente.", 401, details.code);
  }
  if (status >= 400 && status < 500) {
    return new IdentityAuthProviderError("Não foi possível validar os dados de autenticação.", 400, details.code);
  }
  return new IdentityAuthProviderError("Serviço de autenticação indisponível.", 503, details.code);
}

function parseSession(payload: AuthPayload): { userId: string; session: IdentitySession } {
  if (typeof payload.user?.id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.user.id)
    || typeof payload.access_token !== "string" || !payload.access_token
    || typeof payload.refresh_token !== "string" || !payload.refresh_token) {
    throw new IdentityAuthProviderError("Resposta inválida do serviço de autenticação.", 503, "invalid_response");
  }
  return {
    userId: payload.user.id,
    session: { accessToken: payload.access_token, refreshToken: payload.refresh_token },
  };
}

function parseUserId(value: unknown): string {
  if (typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new IdentityAuthProviderError("Resposta inválida do serviço de autenticação.", 503, "invalid_response");
  }
  return value;
}

export function supabaseIdentityAuthProvider(
  internalBaseUrl: string,
  publicBaseUrl: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
): IdentityAuthProvider {
  const headers = { apikey: publishableKey, "content-type": "application/json;charset=UTF-8" };

  const request = async (
    operation: string,
    method: "POST" | "PUT",
    path: string,
    body?: object,
    accessToken?: string,
    redirectTo?: string,
  ): Promise<AuthPayload> => {
    const url = authUrl(internalBaseUrl, path);
    if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        headers: { ...headers, ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new IdentityAuthProviderError("Serviço de autenticação indisponível.", 503, "network_error");
    }
    const payload = await response.json().catch(() => null) as AuthPayload | null;
    if (!response.ok) throw translateFailure(operation, response.status, payload);
    return payload || {};
  };

  return {
    async signup(input): Promise<SignupReceipt> {
      const payload = await request("signup", "POST", "auth/v1/signup", {
        email: input.email,
        password: input.password,
        data: { name: input.name },
        code_challenge: input.codeChallenge,
        code_challenge_method: "s256",
      }, undefined, input.redirectTo);
      const userId = parseUserId(payload.user?.id);
      const identities = payload.user?.identities;
      const identitiesCount = Array.isArray(identities) ? identities.length : null;
      const session = typeof payload.access_token === "string" && typeof payload.refresh_token === "string"
        ? { accessToken: payload.access_token, refreshToken: payload.refresh_token }
        : null;
      return { userId, session, identitiesCount };
    },
    async login(email, password) {
      return parseSession(await request("login", "POST", "auth/v1/token?grant_type=password", { email, password }));
    },
    async requestPasswordReset(email, redirectTo, codeChallenge) {
      await request("recovery", "POST", "auth/v1/recover", {
        email,
        code_challenge: codeChallenge,
        code_challenge_method: "s256",
      }, undefined, redirectTo);
    },
    async googleAuthorizationUrl(redirectTo, codeChallenge) {
      const url = authUrl(publicBaseUrl, "auth/v1/authorize");
      url.searchParams.set("provider", "google");
      url.searchParams.set("redirect_to", redirectTo);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "s256");
      return url.toString();
    },
    async exchangePkceCode(code, codeVerifier) {
      return parseSession(await request(
        "exchange", "POST", "auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: codeVerifier },
      ));
    },
    async updatePassword(accessToken, password) {
      await request("update", "PUT", "auth/v1/user", { password }, accessToken);
    },
    async logout(accessToken) {
      try {
        await request("logout", "POST", "auth/v1/logout?scope=global", undefined, accessToken);
      } catch (error) {
        if (error instanceof IdentityAuthProviderError && error.statusCode === 401) return;
        throw error;
      }
    },
  };
}
