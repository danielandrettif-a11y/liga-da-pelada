import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getPrivateBalanceTag,
  setPrivateBalanceTag,
  type PrivateBalanceTagRepository,
} from "../application/manage-private-balance-tag.js";
import { InvalidPrivateBalanceTagError, privateBalanceTags } from "../domain/private-balance-tag.js";
import { PrivateBalanceTagPersistenceError } from "../infrastructure/pg-private-balance-tag-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPrivateBalanceTagError) {
    return reply.code(400).send({ code: "INVALID_PRIVATE_BALANCE_TAG", message: error.message });
  }
  if (error instanceof PrivateBalanceTagPersistenceError) {
    return reply.code(error.statusCode).send({ code: "PRIVATE_BALANCE_TAG_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "private balance tag operation failed");
  return reply.code(503).send({ code: "PRIVATE_BALANCE_TAG_UNAVAILABLE", message: "Serviço indisponível." });
}

const playerParams = {
  type: "object", required: ["playerId"], properties: { playerId: { type: "string", format: "uuid" } },
} as const;

export function registerPrivateBalanceTagRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: PrivateBalanceTagRepository;
}): void {
  app.get<{ Params: { playerId: string } }>(
    "/api/roster/players/:playerId/private-balance-tag",
    { schema: { params: playerParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await getPrivateBalanceTag(request.params.playerId, authentication.actor, dependencies.repository);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.put<{ Params: { playerId: string }; Body: { tag: unknown } }>(
    "/api/roster/players/:playerId/private-balance-tag",
    {
      schema: {
        params: playerParams,
        body: {
          type: "object", additionalProperties: false, required: ["tag"],
          properties: { tag: { anyOf: [{ type: "string", enum: [...privateBalanceTags] }, { type: "null" }] } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await setPrivateBalanceTag(request.params.playerId, request.body.tag, authentication.actor, dependencies.repository);
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
