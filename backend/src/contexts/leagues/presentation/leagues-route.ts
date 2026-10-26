import type { FastifyInstance } from "fastify";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { createLeague, type LeagueRepository } from "../application/create-league.js";
import { InvalidLeagueError, InvalidLeagueIdError } from "../domain/league.js";
import { LeaguePersistenceError } from "../infrastructure/pg-league-repository.js";
import { requestLeagueMembership, type LeagueMembershipRequestRepository } from "../application/request-league-membership.js";
import { LeagueMembershipRequestPersistenceError } from "../infrastructure/pg-league-membership-request-repository.js";
import {
  joinOpenLeague,
  requestLeagueMembershipByInvite,
  setLeagueFavorite,
  type LeagueLobbyRepository,
} from "../application/manage-league-membership.js";
import { LeagueLobbyPersistenceError } from "../infrastructure/pg-league-lobby-repository.js";
import {
  addExistingAccountToLeague,
  deleteLeague,
  reviewLeagueMembership,
  upgradeLeague,
  updateLeagueVisibility,
  type LeagueAdminRepository,
} from "../application/manage-league-admin.js";
import { LeagueAdminPersistenceError } from "../infrastructure/pg-league-admin-repository.js";
import { createQuickMatch, type QuickMatchRepository } from "../application/create-quick-match.js";
import { InvalidQuickMatchError } from "../domain/quick-match.js";
import { QuickMatchPersistenceError } from "../infrastructure/pg-quick-match-repository.js";

export function registerLeagueRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: LeagueRepository;
  membershipRequestRepository: LeagueMembershipRequestRepository;
  lobbyRepository: LeagueLobbyRepository;
  adminRepository: LeagueAdminRepository;
  quickMatchRepository: QuickMatchRepository;
}): void {
  app.post<{ Body: { date: string; start_time: string; field_name: string; map_url: string } }>(
    "/api/quick-match-sessions",
    {
      schema: {
        body: {
          type: "object", additionalProperties: false,
          required: ["date", "start_time", "field_name", "map_url"],
          properties: {
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            start_time: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
            field_name: { type: "string", maxLength: 120 },
            map_url: { type: "string", maxLength: 1100 },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const session = await createQuickMatch(request.body, authentication.actor, dependencies.quickMatchRepository);
        return reply.code(201).send(session);
      } catch (error) {
        if (error instanceof InvalidQuickMatchError) {
          return reply.code(400).send({ code: "INVALID_QUICK_MATCH", message: error.message });
        }
        if (error instanceof QuickMatchPersistenceError) {
          return reply.code(error.statusCode).send({ code: "QUICK_MATCH_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "quick match creation failed");
        return reply.code(503).send({ code: "QUICK_MATCH_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

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

  app.post<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/memberships",
    { schema: { params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        const result = await joinOpenLeague(request.params.leagueId, authentication.actor, dependencies.lobbyRepository);
        return reply.code(result.joined ? 201 : 200).send(result);
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        if (error instanceof LeagueLobbyPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_MEMBERSHIP_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "open league membership failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.patch<{ Params: { leagueId: string }; Body: { favorite: boolean } }>(
    "/api/leagues/:leagueId/favorite",
    {
      schema: {
        params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } },
        body: { type: "object", additionalProperties: false, required: ["favorite"], properties: { favorite: { type: "boolean" } } },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        return await setLeagueFavorite(
          request.params.leagueId,
          request.body.favorite,
          authentication.actor,
          dependencies.lobbyRepository,
        );
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        if (error instanceof LeagueLobbyPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_FAVORITE_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league favorite toggle failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.post<{ Params: { inviteToken: string } }>(
    "/api/league-invites/:inviteToken/membership-requests",
    { schema: { params: { type: "object", required: ["inviteToken"], properties: { inviteToken: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        const result = await requestLeagueMembershipByInvite(
          request.params.inviteToken,
          authentication.actor,
          dependencies.lobbyRepository,
        );
        return reply.code(202).send(result);
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_INVITE", message: "Convite inválido." });
        if (error instanceof LeagueLobbyPersistenceError) {
          return reply.code(error.statusCode).send({ code: "INVITE_REQUEST_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "invite membership request failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.post<{ Params: { requestId: string }; Body: { approve: boolean } }>(
    "/api/league-membership-requests/:requestId/review",
    {
      schema: {
        params: { type: "object", required: ["requestId"], properties: { requestId: { type: "string", format: "uuid" } } },
        body: { type: "object", additionalProperties: false, required: ["approve"], properties: { approve: { type: "boolean" } } },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        return await reviewLeagueMembership(request.params.requestId, request.body.approve, authentication.actor, dependencies.adminRepository);
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_REQUEST_ID", message: error.message });
        if (error instanceof LeagueAdminPersistenceError) {
          return reply.code(error.statusCode).send({ code: "MEMBERSHIP_REVIEW_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league membership review failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.post<{ Params: { leagueId: string }; Body: { user_id: string } }>(
    "/api/leagues/:leagueId/members",
    {
      schema: {
        params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } },
        body: { type: "object", additionalProperties: false, required: ["user_id"], properties: { user_id: { type: "string", format: "uuid" } } },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        return reply.code(201).send(await addExistingAccountToLeague(
          request.params.leagueId, request.body.user_id, authentication.actor, dependencies.adminRepository,
        ));
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_MEMBER", message: error.message });
        if (error instanceof LeagueAdminPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_MEMBER_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league member addition failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.patch<{ Params: { leagueId: string }; Body: { visibility: string } }>(
    "/api/leagues/:leagueId/visibility",
    {
      schema: {
        params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } },
        body: { type: "object", additionalProperties: false, required: ["visibility"], properties: { visibility: { type: "string", enum: ["private", "open"] } } },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      try {
        return await updateLeagueVisibility(
          request.params.leagueId, request.body.visibility, authentication.actor, dependencies.adminRepository,
        );
      } catch (error) {
        if (error instanceof InvalidLeagueError || error instanceof InvalidLeagueIdError) {
          return reply.code(400).send({ code: "INVALID_VISIBILITY", message: error.message });
        }
        if (error instanceof LeagueAdminPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_VISIBILITY_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league visibility update failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.post<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/upgrade",
    { schema: { params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await upgradeLeague(request.params.leagueId, authentication.actor, dependencies.adminRepository);
      } catch (error) {
        if (error instanceof InvalidLeagueIdError) return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        if (error instanceof LeagueAdminPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_UPGRADE_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league upgrade failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );

  app.delete<{ Params: { leagueId: string }; Body: { confirm_name: string } }>(
    "/api/leagues/:leagueId",
    {
      schema: {
        params: { type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } } },
        body: {
          type: "object", additionalProperties: false, required: ["confirm_name"],
          properties: { confirm_name: { type: "string", minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await deleteLeague(
          request.params.leagueId, request.body.confirm_name, authentication.actor, dependencies.adminRepository,
        );
      } catch (error) {
        if (error instanceof InvalidLeagueError || error instanceof InvalidLeagueIdError) {
          return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
        }
        if (error instanceof LeagueAdminPersistenceError) {
          return reply.code(error.statusCode).send({ code: "LEAGUE_DELETE_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "league deletion failed");
        return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
      }
    },
  );
}
