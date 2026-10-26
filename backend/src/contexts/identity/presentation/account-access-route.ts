import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  listManagedAccounts,
  setManagedAccountRole,
  type AccountAccessRepository,
} from "../application/manage-account-access.js";
import { InvalidAccountAccessError } from "../domain/account-access.js";
import { AccountAccessPersistenceError } from "../infrastructure/pg-account-access-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidAccountAccessError) {
    return reply.code(400).send({ code: "INVALID_ACCOUNT", message: error.message });
  }
  if (error instanceof AccountAccessPersistenceError) {
    return reply.code(error.statusCode).send({ code: "ACCOUNT_ACCESS_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "account access operation failed");
  return reply.code(503).send({ code: "ACCOUNT_ACCESS_UNAVAILABLE", message: "Serviço indisponível." });
}

export function registerAccountAccessRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: AccountAccessRepository;
}): void {
  app.get("/api/identity/accounts", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      return { accounts: await listManagedAccounts(authentication.actor, dependencies.repository) };
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  app.patch<{ Params: { userId: string }; Body: { admin: boolean } }>(
    "/api/identity/accounts/:userId/role",
    {
      schema: {
        params: {
          type: "object", required: ["userId"],
          properties: { userId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object", additionalProperties: false, required: ["admin"],
          properties: { admin: { type: "boolean" } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const role = await setManagedAccountRole(
          request.params.userId, request.body.admin, authentication.actor, dependencies.repository,
        );
        return { role };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
