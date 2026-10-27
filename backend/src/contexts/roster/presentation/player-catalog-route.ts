import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import { getPlayer, getPlayers, type PlayerCatalogRepository } from "../application/get-player-catalog.js";
import { InvalidPlayerCatalogError } from "../domain/player-catalog.js";
import { PlayerCatalogPersistenceError } from "../infrastructure/pg-player-catalog-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerCatalogError) {
    return reply.code(400).send({ code: "INVALID_PLAYER_CATALOG", message: error.message });
  }
  if (error instanceof PlayerCatalogPersistenceError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_CATALOG_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "player catalog operation failed");
  return reply.code(503).send({ code: "PLAYER_CATALOG_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

export function registerPlayerCatalogRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: PlayerCatalogRepository;
}): void {
  app.get<{ Params: { leagueId: string }; Querystring: { selectable_only?: string } }>(
    "/api/roster/leagues/:leagueId/players",
    {
      schema: {
        params: leagueParams,
        querystring: {
          type: "object", additionalProperties: false,
          properties: { selectable_only: { type: "string", enum: ["true", "false"] } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const players = await getPlayers(
          request.params.leagueId,
          request.query.selectable_only === "true",
          authentication.actor,
          dependencies.repository,
        );
        return { players };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId",
    {
      schema: {
        params: {
          type: "object", required: ["leagueId", "playerId"], properties: {
            leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const player = await getPlayer(
          request.params.leagueId, request.params.playerId, authentication.actor, dependencies.repository,
        );
        return { player };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
