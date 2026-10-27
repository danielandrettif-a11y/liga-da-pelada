import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getRosterUnreadState,
  getUnreadRosterPlayers,
  markRosterActivitySeen,
  markRosterActivitySeenThrough,
  type RosterActivityRepository,
} from "../application/manage-roster-activity.js";
import { InvalidRosterActivityError } from "../domain/roster-activity.js";
import { RosterActivityPersistenceError } from "../infrastructure/pg-roster-activity-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidRosterActivityError) {
    return reply.code(400).send({ code: "INVALID_ROSTER_ACTIVITY", message: error.message });
  }
  if (error instanceof RosterActivityPersistenceError) {
    return reply.code(error.statusCode).send({ code: "ROSTER_ACTIVITY_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "roster activity operation failed");
  return reply.code(503).send({ code: "ROSTER_ACTIVITY_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

export function registerRosterActivityRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: RosterActivityRepository;
}): void {
  app.get<{ Params: { leagueId: string } }>(
    "/api/roster/leagues/:leagueId/activity/unread-state",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await getRosterUnreadState(request.params.leagueId, authentication.actor, dependencies.repository);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string } }>(
    "/api/roster/leagues/:leagueId/activity/unread-players",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await getUnreadRosterPlayers(request.params.leagueId, authentication.actor, dependencies.repository);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.put<{ Params: { leagueId: string }; Body: { seenThrough: string } }>(
    "/api/roster/leagues/:leagueId/activity/read-through",
    {
      schema: {
        params: leagueParams,
        body: {
          type: "object", additionalProperties: false, required: ["seenThrough"],
          properties: { seenThrough: { type: "string", minLength: 1, maxLength: 64 } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await markRosterActivitySeenThrough(
          request.params.leagueId, request.body.seenThrough, authentication.actor, dependencies.repository,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.put<{ Params: { leagueId: string } }>(
    "/api/roster/leagues/:leagueId/activity/read",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await markRosterActivitySeen(request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
