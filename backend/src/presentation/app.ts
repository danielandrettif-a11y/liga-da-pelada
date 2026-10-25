import Fastify, { type FastifyInstance } from "fastify";
import type { GoalRepository } from "../contexts/matches/application/register-goal.js";
import type { LeagueRepository } from "../contexts/leagues/application/create-league.js";
import type { LeagueMembershipRequestRepository } from "../contexts/leagues/application/request-league-membership.js";
import { registerGoalRoutes } from "../contexts/matches/presentation/goals-route.js";
import { registerLeagueRoutes } from "../contexts/leagues/presentation/leagues-route.js";
import type { UserVerifier } from "../infrastructure/auth-user-verifier.js";

export function createApp(dependencies: {
  goalsEnabled: boolean;
  leaguesEnabled?: boolean;
  verifier: UserVerifier;
  repository: GoalRepository;
  leagueRepository?: LeagueRepository;
  leagueMembershipRequestRepository?: LeagueMembershipRequestRepository;
  logger?: boolean;
}): FastifyInstance {
  if (dependencies.leaguesEnabled && !dependencies.leagueRepository) {
    throw new Error("LeagueRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.leagueMembershipRequestRepository) {
    throw new Error("LeagueMembershipRequestRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  const app = Fastify({ logger: dependencies.logger ?? true });
  app.setErrorHandler((error, request, reply) => {
    if (error && typeof error === "object" && "validation" in error && error.validation) {
      return reply.code(400).send({ code: "INVALID_REQUEST", message: "Dados da requisição inválidos." });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return reply.code(415).send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Formato da requisição não suportado." });
    }
    if (error && typeof error === "object" && "statusCode" in error
      && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ code: "INVALID_REQUEST", message: "Requisição inválida." });
    }
    request.log.error({ err: error }, "unhandled request error");
    return reply.code(503).send({ code: "UNAVAILABLE", message: "Serviço indisponível." });
  });
  app.get("/health", async () => ({ status: "ok" }));

  if (dependencies.goalsEnabled) {
    registerGoalRoutes(app, { verifier: dependencies.verifier, repository: dependencies.repository });
  }
  if (dependencies.leaguesEnabled && dependencies.leagueRepository && dependencies.leagueMembershipRequestRepository) {
    registerLeagueRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.leagueRepository,
      membershipRequestRepository: dependencies.leagueMembershipRequestRepository,
    });
  }
  return app;
}
