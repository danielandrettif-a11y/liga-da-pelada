import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  drawLeagueTeamsBySpeed,
  getPlayerSpeedRatings,
  setPlayerSpeedRating,
  type SpeedRatingRepository,
} from "../application/manage-speed-ratings.js";
import { InvalidSpeedDrawError } from "../domain/speed-draw.js";
import { SpeedRatingPersistenceError } from "../infrastructure/pg-speed-rating-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidSpeedDrawError) {
    return reply.code(400).send({ code: "INVALID_SPEED_REQUEST", message: error.message });
  }
  if (error instanceof SpeedRatingPersistenceError) {
    return reply.code(error.statusCode).send({ code: "SPEED_RATING_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "speed rating operation failed");
  return reply.code(503).send({ code: "SPEED_RATING_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

export function registerSpeedRatingRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: SpeedRatingRepository;
}): void {
  app.get<{ Params: { leagueId: string } }>(
    "/api/roster/leagues/:leagueId/speed-ratings",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { ratings: await getPlayerSpeedRatings(
          request.params.leagueId, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.put<{ Params: { leagueId: string; playerId: string }; Body: { rating: 1 | 2 | 3 | null } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/speed-rating",
    {
      schema: {
        params: {
          type: "object", required: ["leagueId", "playerId"],
          properties: {
            leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object", additionalProperties: false, required: ["rating"],
          properties: { rating: { anyOf: [{ type: "integer", minimum: 1, maximum: 3 }, { type: "null" }] } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await setPlayerSpeedRating(
          request.params.leagueId, request.params.playerId, request.body.rating,
          authentication.actor, dependencies.repository,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{
    Params: { leagueId: string };
    Body: { playerIds: string[]; attendanceOrder?: string[]; teamCount: number; playersPerTeam: number };
  }>(
    "/api/roster/leagues/:leagueId/speed-draw",
    {
      schema: {
        params: leagueParams,
        body: {
          type: "object", additionalProperties: false,
          required: ["playerIds", "teamCount", "playersPerTeam"],
          properties: {
            playerIds: { type: "array", minItems: 1, maxItems: 40, items: { type: "string", format: "uuid" } },
            attendanceOrder: { type: "array", maxItems: 40, items: { type: "string", format: "uuid" } },
            teamCount: { type: "integer", minimum: 2, maximum: 4 },
            playersPerTeam: { type: "integer", minimum: 1, maximum: 10 },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await drawLeagueTeamsBySpeed(
          request.params.leagueId, request.body, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
