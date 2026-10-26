import type { FastifyInstance } from "fastify";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import {
  getLeagueConfig,
  updateLeagueName,
  updateLeaguePreseason,
  updateLeagueSettings,
  type LeagueConfigRepository,
} from "../application/manage-league-config.js";
import { InvalidLeagueIdError } from "../domain/league.js";
import { InvalidLeagueSettingsError } from "../domain/league-settings.js";
import { LeagueConfigPersistenceError } from "../infrastructure/pg-league-config-repository.js";

const paramsSchema = {
  type: "object",
  required: ["leagueId"],
  properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

export function registerLeagueConfigRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: LeagueConfigRepository;
}): void {
  app.get<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/config",
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }
      try {
        return await getLeagueConfig(request.params.leagueId, authentication.actor, dependencies.repository);
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        if (error instanceof LeagueConfigPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_CONFIG_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league config read failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.patch<{ Params: { leagueId: string }; Body: { name: string } }>(
    "/api/leagues/:leagueId/name",
    {
      schema: {
        params: paramsSchema,
        body: {
          type: "object", additionalProperties: false, required: ["name"],
          properties: { name: { type: "string", minLength: 1, maxLength: 200 } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await updateLeagueName(
          request.params.leagueId, request.body.name, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        if (error instanceof InvalidLeagueIdError || error instanceof InvalidLeagueSettingsError) {
          return reply.code(400).send({ code: "INVALID_LEAGUE_CONFIG", message: error.message });
        }
        if (error instanceof LeagueConfigPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_CONFIG_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league name update failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.patch<{
    Params: { leagueId: string };
    Body: {
      match_duration: number;
      players_per_team: number;
      teams_per_round: number;
      stadium_name: string;
      stadium_map_url: string;
      event_duration_minutes: number;
    };
  }>(
    "/api/leagues/:leagueId/config",
    {
      schema: {
        params: paramsSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "match_duration", "players_per_team", "teams_per_round",
            "stadium_name", "stadium_map_url", "event_duration_minutes",
          ],
          properties: {
            match_duration: { type: "integer" },
            players_per_team: { type: "integer" },
            teams_per_round: { type: "integer" },
            stadium_name: { type: "string", maxLength: 240 },
            stadium_map_url: { type: "string", maxLength: 1000 },
            event_duration_minutes: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await updateLeagueSettings(
          request.params.leagueId, request.body, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        if (error instanceof InvalidLeagueIdError || error instanceof InvalidLeagueSettingsError) {
          return reply.code(400).send({ code: "INVALID_LEAGUE_CONFIG", message: error.message });
        }
        if (error instanceof LeagueConfigPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_CONFIG_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league config update failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.patch<{ Params: { leagueId: string }; Body: { enabled: boolean } }>(
    "/api/leagues/:leagueId/preseason",
    {
      schema: {
        params: paramsSchema,
        body: {
          type: "object", additionalProperties: false, required: ["enabled"],
          properties: { enabled: { type: "boolean" } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await updateLeaguePreseason(
          request.params.leagueId, request.body.enabled, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        if (error instanceof LeagueConfigPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_CONFIG_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league preseason update failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );
}
