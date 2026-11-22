import type { Actor } from "../shared/actor.js";

export interface UserVerifier {
  verifyAccessToken(token: string): Promise<Actor | null>;
}

const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 1024;

function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Consulta o Auth auto-hospedado; nunca usa o userId enviado pelo navegador. */
export function supabaseUserVerifier(
  baseUrl: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): UserVerifier {
  const userUrl = new URL("auth/v1/user", `${baseUrl.replace(/\/+$/, "")}/`);
  const cache = new Map<string, { actor: Actor; expiresAt: number }>();
  const pending = new Map<string, Promise<Actor | null>>();

  async function verifyWithAuth(token: string): Promise<Actor | null> {
    const response = await fetcher(userUrl, {
      headers: { authorization: `Bearer ${token}`, apikey: publishableKey },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`Auth indisponível (${response.status}).`);
    const user: unknown = await response.json();
    if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
      throw new Error("Resposta de Auth inválida.");
    }
    const identity = user as {
      id: string;
      email?: unknown;
      user_metadata?: { name?: unknown; full_name?: unknown; display_name?: unknown };
    };
    const metadata = identity.user_metadata;
    const name = [metadata?.name, metadata?.full_name, metadata?.display_name]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return {
      userId: identity.id,
      email: typeof identity.email === "string" ? identity.email : null,
      name: name?.trim() || null,
    };
  }

  return {
    async verifyAccessToken(token) {
      const cached = cache.get(token);
      if (cached) {
        cache.delete(token);
        if (cached.expiresAt > now()) {
          cache.set(token, cached);
          return cached.actor;
        }
      }

      const existing = pending.get(token);
      if (existing) return existing;
      const request = verifyWithAuth(token).then((actor) => {
        const checkedAt = now();
        // O JWT só limita a duração do cache. A identidade vem do Auth.
        const expiresAt = Math.min(checkedAt + CACHE_TTL_MS, tokenExpiry(token));
        if (actor && expiresAt > checkedAt) {
          cache.set(token, { actor, expiresAt });
          if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        }
        return actor;
      });

      if (pending.size >= CACHE_LIMIT) return request;
      pending.set(token, request);
      try {
        return await request;
      } finally {
        pending.delete(token);
      }
    },
  };
}
