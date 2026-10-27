import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getMyFitnessRounds,
  getPlayerFitnessSummaries,
  saveMyFitness,
  setMyFitnessVisibility,
  type FitnessRepository,
} from "../application/manage-fitness.js";
import { InvalidFitnessError } from "../domain/fitness.js";
import { FitnessPersistenceError } from "../infrastructure/pg-fitness-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidFitnessError) {
    return reply.code(400).send({ code: "INVALID_FITNESS", message: error.message });
  }
  if (error instanceof FitnessPersistenceError) {
    return reply.code(error.statusCode).send({ code: "FITNESS_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "fitness operation failed");
  return reply.code(503).send({ code: "FITNESS_UNAVAILABLE", message: "Serviço indisponível." });
}

const playerParams = {
  type: "object", required: ["playerId"], properties: { playerId: { type: "string", format: "uuid" } },
} as const;
const leagueQuery = {
  type: "object", additionalProperties: false, required: ["league_id"],
  properties: { league_id: { type: "string", format: "uuid" } },
} as const;

export function registerFitnessRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: FitnessRepository;
}): void {
  app.get<{ Params: { playerId: string }; Querystring: { league_id: string } }>(
    "/api/roster/players/:playerId/fitness-rounds",
    { schema: { params: playerParams, querystring: leagueQuery } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { rounds: await getMyFitnessRounds(
          request.params.playerId, request.query.league_id, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { playerId: string }; Querystring: { league_id: string } }>(
    "/api/roster/players/:playerId/fitness-summary",
    { schema: { params: playerParams, querystring: leagueQuery } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { summaries: await getPlayerFitnessSummaries(
          request.params.playerId, request.query.league_id, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.put<{ Params: { roundId: string }; Body: { distance: number; pace: number } }>(
    "/api/roster/rounds/:roundId/my-fitness",
    {
      schema: {
        params: { type: "object", required: ["roundId"], properties: { roundId: { type: "string", format: "uuid" } } },
        body: {
          type: "object", additionalProperties: false, required: ["distance", "pace"],
          properties: { distance: { type: "number" }, pace: { type: "number" } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const playerId = await saveMyFitness(
          request.params.roundId, request.body.distance, request.body.pace,
          authentication.actor, dependencies.repository,
        );
        return { player_id: playerId };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.patch<{ Body: { visible: boolean } }>(
    "/api/roster/me/fitness-visibility",
    {
      schema: {
        body: {
          type: "object", additionalProperties: false, required: ["visible"],
          properties: { visible: { type: "boolean" } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { player_id: await setMyFitnessVisibility(
          request.body.visible, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
