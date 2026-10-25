import type { FastifyRequest } from "fastify";
import type { Actor } from "../shared/actor.js";
import type { UserVerifier } from "../infrastructure/auth-user-verifier.js";

type AuthFailure = { statusCode: 401 | 503; code: string; message: string };
export type AuthResult = { actor: Actor } | { error: AuthFailure };

export async function authenticateBearer(request: FastifyRequest, verifier: UserVerifier): Promise<AuthResult> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
    return { error: { statusCode: 401, code: "UNAUTHENTICATED", message: "Sessão ausente." } };
  }
  try {
    const actor = await verifier.verifyAccessToken(authorization.slice(7));
    if (!actor) return { error: { statusCode: 401, code: "UNAUTHENTICATED", message: "Sessão inválida." } };
    return { actor };
  } catch (error) {
    request.log.error({ err: error }, "auth verification failed");
    return { error: { statusCode: 503, code: "AUTH_UNAVAILABLE", message: "Autenticação indisponível." } };
  }
}
