import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { GoalRepository } from "../contexts/matches/application/register-goal.js";
import type { LeagueRepository } from "../contexts/leagues/application/create-league.js";
import type { LeagueMembershipRequestRepository } from "../contexts/leagues/application/request-league-membership.js";
import type { LeagueLobbyRepository } from "../contexts/leagues/application/manage-league-membership.js";
import type { LeagueAdminRepository } from "../contexts/leagues/application/manage-league-admin.js";
import type { LeagueConfigRepository } from "../contexts/leagues/application/manage-league-config.js";
import type { QuickMatchRepository } from "../contexts/leagues/application/create-quick-match.js";
import type { SeasonRepository } from "../contexts/leagues/application/manage-seasons.js";
import type { StadiumRepository } from "../contexts/leagues/application/manage-stadiums.js";
import type { LeagueEntryRepository } from "../contexts/leagues/application/manage-league-entry.js";
import type {
  LeagueBrandingRepository,
  LeagueBrandingStorage,
} from "../contexts/leagues/application/manage-league-branding.js";
import { registerGoalRoutes } from "../contexts/matches/presentation/goals-route.js";
import { registerLeagueRoutes } from "../contexts/leagues/presentation/leagues-route.js";
import { registerLeagueConfigRoutes } from "../contexts/leagues/presentation/league-config-route.js";
import { registerSeasonRoutes } from "../contexts/leagues/presentation/season-route.js";
import { registerStadiumRoutes } from "../contexts/leagues/presentation/stadium-route.js";
import { registerLeagueEntryRoutes } from "../contexts/leagues/presentation/league-entry-route.js";
import { registerLeagueBrandingRoutes } from "../contexts/leagues/presentation/league-branding-route.js";
import type { UserVerifier } from "../infrastructure/auth-user-verifier.js";

export function createApp(dependencies: {
  goalsEnabled: boolean;
  leaguesEnabled?: boolean;
  verifier: UserVerifier;
  repository: GoalRepository;
  leagueRepository?: LeagueRepository;
  leagueMembershipRequestRepository?: LeagueMembershipRequestRepository;
  leagueLobbyRepository?: LeagueLobbyRepository;
  leagueAdminRepository?: LeagueAdminRepository;
  leagueConfigRepository?: LeagueConfigRepository;
  quickMatchRepository?: QuickMatchRepository;
  seasonRepository?: SeasonRepository;
  stadiumRepository?: StadiumRepository;
  leagueEntryRepository?: LeagueEntryRepository;
  leagueBrandingRepository?: LeagueBrandingRepository;
  leagueBrandingStorage?: LeagueBrandingStorage;
  logger?: boolean;
}): FastifyInstance {
  if (dependencies.leaguesEnabled && !dependencies.leagueRepository) {
    throw new Error("LeagueRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.leagueMembershipRequestRepository) {
    throw new Error("LeagueMembershipRequestRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.leagueLobbyRepository) {
    throw new Error("LeagueLobbyRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.leagueAdminRepository) {
    throw new Error("LeagueAdminRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.leagueConfigRepository) {
    throw new Error("LeagueConfigRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.quickMatchRepository) {
    throw new Error("QuickMatchRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.seasonRepository) {
    throw new Error("SeasonRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.stadiumRepository) {
    throw new Error("StadiumRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && !dependencies.leagueEntryRepository) {
    throw new Error("LeagueEntryRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  if (dependencies.leaguesEnabled && (!dependencies.leagueBrandingRepository || !dependencies.leagueBrandingStorage)) {
    throw new Error("BrandingRepository e BrandingStorage são obrigatórios quando ENABLE_LEAGUE_API=true.");
  }
  const app = Fastify({ logger: dependencies.logger ?? true });
  void app.register(multipart);
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
  if (dependencies.leaguesEnabled && dependencies.leagueRepository
    && dependencies.leagueMembershipRequestRepository && dependencies.leagueLobbyRepository
    && dependencies.leagueAdminRepository && dependencies.leagueConfigRepository && dependencies.quickMatchRepository
    && dependencies.seasonRepository && dependencies.stadiumRepository && dependencies.leagueEntryRepository
    && dependencies.leagueBrandingRepository && dependencies.leagueBrandingStorage) {
    registerLeagueRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.leagueRepository,
      membershipRequestRepository: dependencies.leagueMembershipRequestRepository,
      lobbyRepository: dependencies.leagueLobbyRepository,
      adminRepository: dependencies.leagueAdminRepository,
      quickMatchRepository: dependencies.quickMatchRepository,
    });
    registerLeagueConfigRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.leagueConfigRepository,
    });
    registerSeasonRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.seasonRepository,
    });
    registerStadiumRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.stadiumRepository,
    });
    registerLeagueEntryRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.leagueEntryRepository,
    });
    registerLeagueBrandingRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.leagueBrandingRepository,
      storage: dependencies.leagueBrandingStorage,
    });
  }
  return app;
}
