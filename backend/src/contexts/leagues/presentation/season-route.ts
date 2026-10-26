import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { InvalidLeagueIdError } from "../domain/league.js";
import { SeasonRuleError, SeasonValidationError } from "../domain/season.js";
import {
  finishSeason,
  getActiveSeason,
  getActiveSeasonRoundIds,
  getLatestFinishedSeason,
  type SeasonRepository,
} from "../application/manage-seasons.js";
import { SeasonPersistenceError } from "../infrastructure/pg-season-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidLeagueIdError || error instanceof SeasonValidationError) {
    return reply.code(400).send({ code: "INVALID_SEASON_REQUEST", message: error.message });
  }
  if (error instanceof SeasonRuleError) {
    return reply.code(409).send({ code: "SEASON_NOT_READY", message: error.message });
  }
  if (error instanceof SeasonPersistenceError) {
    return reply.code(error.statusCode).send({ code: "SEASON_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "season operation failed");
  return reply.code(503).send({ code: "SEASON_UNAVAILABLE", message: "Serviço indisponível." });
}

export function registerSeasonRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: SeasonRepository;
}): void {
  app.get<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/seasons/active",
    { schema: { params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { season: await getActiveSeason(request.params.leagueId, authentication.actor, dependencies.repository) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string }; Querystring: { round_type?: string } }>(
    "/api/leagues/:leagueId/seasons/active/rounds",
    {
      schema: {
        params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } },
        querystring: { type: "object", additionalProperties: false, properties: { round_type: { type: "string", enum: ["official", "friendly"] } } },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return {
          round_ids: await getActiveSeasonRoundIds(
            request.params.leagueId, request.query.round_type || "official", authentication.actor, dependencies.repository,
          ),
        };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/seasons/latest-finished",
    { schema: { params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { summary: await getLatestFinishedSeason(request.params.leagueId, authentication.actor, dependencies.repository) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Params: { leagueId: string }; Body: { confirmation: string } }>(
    "/api/leagues/:leagueId/seasons/active/finish",
    {
      schema: {
        params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } },
        body: {
          type: "object", additionalProperties: false, required: ["confirmation"],
          properties: { confirmation: { type: "string", minLength: 1, maxLength: 20 } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await finishSeason(
          request.params.leagueId, request.body.confirmation, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
