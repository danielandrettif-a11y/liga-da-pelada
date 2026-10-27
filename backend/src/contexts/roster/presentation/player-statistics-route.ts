import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { PlayerCatalogRepository } from "../application/get-player-catalog.js";
import {
  getPlayersWithStats,
  getRosterGroups,
  type PlayerStatisticsRepository,
} from "../application/get-player-statistics.js";
import { InvalidPlayerCatalogError } from "../domain/player-catalog.js";
import { InvalidPlayerStatisticsError } from "../domain/player-statistics.js";
import { PlayerCatalogPersistenceError } from "../infrastructure/pg-player-catalog-repository.js";
import { PlayerStatisticsPersistenceError } from "../infrastructure/pg-player-statistics-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerCatalogError || error instanceof InvalidPlayerStatisticsError) {
    return reply.code(400).send({ code: "INVALID_PLAYER_STATISTICS", message: error.message });
  }
  if (error instanceof PlayerCatalogPersistenceError || error instanceof PlayerStatisticsPersistenceError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_STATISTICS_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "player statistics operation failed");
  return reply.code(503).send({ code: "PLAYER_STATISTICS_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

const roundTypeQuery = {
  type: "object", additionalProperties: false,
  properties: {
    round_type: { type: "string", enum: ["official", "friendly"], default: "official" },
    selectable_only: { type: "string", enum: ["true", "false"], default: "false" },
  },
} as const;

export function registerPlayerStatisticsRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  catalog: PlayerCatalogRepository;
  statistics: PlayerStatisticsRepository;
}): void {
  app.get<{
    Params: { leagueId: string };
    Querystring: { round_type?: string; selectable_only?: string };
  }>(
    "/api/roster/leagues/:leagueId/player-statistics",
    { schema: { params: leagueParams, querystring: roundTypeQuery } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const players = await getPlayersWithStats(
          request.params.leagueId,
          request.query.round_type || "official",
          request.query.selectable_only === "true",
          authentication.actor,
          dependencies.catalog,
          dependencies.statistics,
        );
        return { players };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string }; Querystring: { round_type?: string } }>(
    "/api/roster/leagues/:leagueId/roster-groups",
    {
      schema: {
        params: leagueParams,
        querystring: {
          type: "object", additionalProperties: false,
          properties: { round_type: { type: "string", enum: ["official", "friendly"], default: "official" } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await getRosterGroups(
          request.params.leagueId,
          request.query.round_type || "official",
          authentication.actor,
          dependencies.catalog,
          dependencies.statistics,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
