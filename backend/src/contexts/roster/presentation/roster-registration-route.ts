import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getRegisteredMergeCandidates,
  getRegistrationHistory,
  type RosterRegistrationRepository,
} from "../application/get-roster-registration.js";
import { InvalidRosterRegistrationError } from "../domain/roster-registration.js";
import { RosterRegistrationPersistenceError } from "../infrastructure/pg-roster-registration-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidRosterRegistrationError) {
    return reply.code(400).send({ code: "INVALID_ROSTER_REGISTRATION", message: error.message });
  }
  if (error instanceof RosterRegistrationPersistenceError) {
    return reply.code(error.statusCode).send({ code: "ROSTER_REGISTRATION_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "roster registration operation failed");
  return reply.code(503).send({ code: "ROSTER_REGISTRATION_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

export function registerRosterRegistrationRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: RosterRegistrationRepository;
}): void {
  app.get<{ Params: { leagueId: string } }>(
    "/api/roster/leagues/:leagueId/registrations",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { events: await getRegistrationHistory(
          request.params.leagueId, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string; guestId: string } }>(
    "/api/roster/leagues/:leagueId/players/:guestId/merge-candidates",
    {
      schema: {
        params: {
          type: "object", required: ["leagueId", "guestId"], properties: {
            leagueId: { type: "string", format: "uuid" }, guestId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { players: await getRegisteredMergeCandidates(
          request.params.leagueId, request.params.guestId, authentication.actor, dependencies.repository,
        ) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
