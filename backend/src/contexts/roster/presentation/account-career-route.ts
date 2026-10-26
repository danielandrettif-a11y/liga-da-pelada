import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import { getAccountCareer, type AccountCareerRepository } from "../application/get-account-career.js";
import { AccountCareerPersistenceError } from "../infrastructure/pg-account-career-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AccountCareerPersistenceError) {
    return reply.code(503).send({ code: "ACCOUNT_CAREER_UNAVAILABLE", message: error.message });
  }
  request.log.error({ err: error }, "account career operation failed");
  return reply.code(503).send({ code: "ACCOUNT_CAREER_UNAVAILABLE", message: "Serviço indisponível." });
}

export function registerAccountCareerRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: AccountCareerRepository;
}): void {
  app.get("/api/roster/me/career", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      return await getAccountCareer(authentication.actor, dependencies.repository);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });
}
