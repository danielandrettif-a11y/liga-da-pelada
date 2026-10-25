import type { Actor } from "../shared/actor.js";

export interface UserVerifier {
  verifyAccessToken(token: string): Promise<Actor | null>;
}

/** Consulta o Auth auto-hospedado; nunca usa o userId enviado pelo navegador. */
export function supabaseUserVerifier(baseUrl: string, publishableKey: string): UserVerifier {
  const userUrl = new URL("auth/v1/user", `${baseUrl.replace(/\/+$/, "")}/`);
  return {
    async verifyAccessToken(token) {
      const response = await fetch(userUrl, {
        headers: { authorization: `Bearer ${token}`, apikey: publishableKey },
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error(`Auth indisponível (${response.status}).`);
      const user: unknown = await response.json();
      if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string") {
        throw new Error("Resposta de Auth inválida.");
      }
      return { userId: user.id };
    },
  };
}
