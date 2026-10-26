import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  authorizeLeagueSelection,
  completeLeagueEntryFlow,
  type LeagueEntryRepository,
} from "../application/manage-league-entry.js";
import { InvalidLeagueEntryError } from "../domain/league-entry.js";
import { InvalidLeagueIdError } from "../domain/league.js";
import { LeagueEntryPersistenceError } from "../infrastructure/pg-league-entry-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidLeagueEntryError || error instanceof InvalidLeagueIdError) {
    return reply.code(400).send({ code: "INVALID_LEAGUE_ENTRY", message: error.message });
  }
  if (error instanceof LeagueEntryPersistenceError) {
    return reply.code(error.statusCode).send({ code: "LEAGUE_ENTRY_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "league entry operation failed");
  return reply.code(503).send({ code: "LEAGUE_ENTRY_UNAVAILABLE", message: "Serviço indisponível." });
}

export function registerLeagueEntryRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: LeagueEntryRepository;
}): void {
  app.post<{ Body: { version: number } }>(
    "/api/account/entry-flow/complete",
    {
      schema: {
        body: {
          type: "object", additionalProperties: false, required: ["version"],
          properties: { version: { type: "integer", minimum: 1, maximum: 1000 } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await completeLeagueEntryFlow(request.body.version, authentication.actor, dependencies.repository);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Params: { leagueId: string }; Body: { mode: string } }>(
    "/api/leagues/:leagueId/selection",
    {
      schema: {
        params: {
          type: "object", required: ["leagueId"],
          properties: { leagueId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object", additionalProperties: false, required: ["mode"],
          properties: { mode: { type: "string", enum: ["active", "archived-quick"] } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await authorizeLeagueSelection(
          request.params.leagueId, request.body.mode, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
