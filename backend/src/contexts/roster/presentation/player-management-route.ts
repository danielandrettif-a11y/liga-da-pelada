import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  createPlayer,
  importGuestRoster,
  swapPlayerAvatars,
  updatePlayer,
  type PlayerManagementRepository,
} from "../application/manage-players.js";
import { InvalidPlayerManagementError } from "../domain/player-management.js";
import { PlayerManagementPersistenceError } from "../infrastructure/pg-player-management-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerManagementError) {
    return reply.code(400).send({ code: "INVALID_PLAYER_MANAGEMENT", message: error.message });
  }
  if (error instanceof PlayerManagementPersistenceError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_MANAGEMENT_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "player management operation failed");
  return reply.code(503).send({ code: "PLAYER_MANAGEMENT_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

const playerParams = {
  type: "object", required: ["leagueId", "playerId"], properties: {
    leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
  },
} as const;

const playerProperties = {
  name: { type: "string", maxLength: 120 },
  nickname: { anyOf: [{ type: "string", maxLength: 60 }, { type: "null" }] },
  avatar_url: { anyOf: [{ type: "string", maxLength: 2048 }, { type: "null" }] },
  player_profile: { type: "string", enum: ["offensive", "midfield", "defensive"] },
  overall_traits: {
    type: "array", maxItems: 3, items: { type: "string", enum: ["offensive", "midfield", "defensive"] },
  },
  member_category: { type: "string", enum: ["player", "guest", "wag", "supporter"] },
  is_selectable: { type: "boolean" },
} as const;

export function registerPlayerManagementRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: PlayerManagementRepository;
}): void {
  app.post<{ Params: { leagueId: string }; Body: Record<string, unknown> }>(
    "/api/roster/leagues/:leagueId/players",
    {
      schema: {
        params: leagueParams,
        body: {
          type: "object", additionalProperties: false, required: ["name", "member_category"],
          properties: playerProperties,
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const player = await createPlayer(
          request.params.leagueId, request.body, authentication.actor, dependencies.repository,
        );
        return reply.code(201).send({ player });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.patch<{ Params: { leagueId: string; playerId: string }; Body: Record<string, unknown> }>(
    "/api/roster/leagues/:leagueId/players/:playerId",
    {
      schema: {
        params: playerParams,
        body: { type: "object", additionalProperties: false, properties: playerProperties },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const player = await updatePlayer(
          request.params.leagueId, request.params.playerId, request.body,
          authentication.actor, dependencies.repository,
        );
        return { player };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/swap-avatars",
    { schema: { params: playerParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await swapPlayerAvatars(
          request.params.leagueId, request.params.playerId, authentication.actor, dependencies.repository,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Params: { leagueId: string }; Body: { names: unknown[] } }>(
    "/api/roster/leagues/:leagueId/guest-imports",
    {
      schema: {
        params: leagueParams,
        body: {
          type: "object", additionalProperties: false, required: ["names"],
          properties: { names: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const guests = await importGuestRoster(
          request.params.leagueId, request.body.names, authentication.actor, dependencies.repository,
        );
        return reply.code(201).send({ guests, createdCount: guests.length });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
