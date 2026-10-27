import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getPlayerGoalsByClub,
  getPlayerPlaytime,
  type PlayerProfilePerformanceRepository,
} from "../application/get-player-profile-performance.js";
import { InvalidPlayerCatalogError } from "../domain/player-catalog.js";
import { PlayerProfilePerformancePersistenceError } from "../infrastructure/pg-player-profile-performance-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerCatalogError) {
    return reply.code(400).send({ code: "INVALID_PLAYER_PROFILE", message: error.message });
  }
  if (error instanceof PlayerProfilePerformancePersistenceError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_PROFILE_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "player profile performance operation failed");
  return reply.code(503).send({ code: "PLAYER_PROFILE_UNAVAILABLE", message: "Serviço indisponível." });
}

const params = {
  type: "object", required: ["leagueId", "playerId"], properties: {
    leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
  },
} as const;

export function registerPlayerProfilePerformanceRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: PlayerProfilePerformanceRepository;
}): void {
  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/playtime",
    { schema: { params } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { playtime: await getPlayerPlaytime(
          request.params.leagueId, request.params.playerId, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/club-goals",
    { schema: { params } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { clubs: await getPlayerGoalsByClub(
          request.params.leagueId, request.params.playerId, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
