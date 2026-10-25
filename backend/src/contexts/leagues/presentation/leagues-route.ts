import type { FastifyInstance } from "fastify";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { createLeague, type LeagueRepository } from "../application/create-league.js";
import { InvalidLeagueError, InvalidLeagueIdError } from "../domain/league.js";
import { LeaguePersistenceError } from "../infrastructure/pg-league-repository.js";
import { requestLeagueMembership, type LeagueMembershipRequestRepository } from "../application/request-league-membership.js";
import { LeagueMembershipRequestPersistenceError } from "../infrastructure/pg-league-membership-request-repository.js";

export function registerLeagueRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: LeagueRepository;
  membershipRequestRepository: LeagueMembershipRequestRepository;
}): void {
  app.post<{ Body: { name: string; tier: string; visibility: string } }>(
    "/api/leagues",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "tier", "visibility"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 200 },
            tier: { type: "string", enum: ["quick", "basic", "complete"] },
            visibility: { type: "string", enum: ["private", "open"] },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        const created = await createLeague(request.body, authentication.actor, dependencies.repository);
        return reply.code(201).send(created);
      } catch (error) {
        if (error instanceof InvalidLeagueError) {
          return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        }
        if (error instanceof LeaguePersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league creation failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.post<{ Params: { leagueId: string } }>(
      "/api/leagues/:leagueId/membership-requests",
      {
        schema: {
          params: {
            type: "object",
            required: ["leagueId"],
            properties: { leagueId: { type: "string", format: "uuid" } },
          },
        },
      },
      async (request, reply) => {
        const authentication = await authenticateBearer(request, dependencies.verifier);
        if ("error" in authentication) {
          return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
        }
        try {
          const result = await requestLeagueMembership(
            request.params.leagueId,
            authentication.actor,
            dependencies.membershipRequestRepository,
          );
          return reply.code(result.requested ? 202 : 200).send(result);
        } catch (error) {
          if (error instanceof InvalidLeagueIdError) {
            return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
          }
          if (error instanceof LeagueMembershipRequestPersistenceError) {
            return reply.code(error.statusCode).send({ code: "MEMBERSHIP_REQUEST_REJECTED", message: error.message });
          }
          request.log.error({ err: error }, "league membership request failed");
          return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
        }
      },
  );
}
