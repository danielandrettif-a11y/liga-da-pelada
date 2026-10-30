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
import type { AccountAccessRepository } from "../contexts/identity/application/manage-account-access.js";
import type {
  IdentityAuthProvider,
  IdentityProfileRepository,
} from "../contexts/identity/application/manage-authentication.js";
import type { AccountCareerRepository } from "../contexts/roster/application/get-account-career.js";
import type { PrivateBalanceTagRepository } from "../contexts/roster/application/manage-private-balance-tag.js";
import type { FitnessRepository } from "../contexts/roster/application/manage-fitness.js";
import type { SpeedRatingRepository } from "../contexts/roster/application/manage-speed-ratings.js";
import type { RosterActivityRepository } from "../contexts/roster/application/manage-roster-activity.js";
import type { PlayerCatalogRepository } from "../contexts/roster/application/get-player-catalog.js";
import type { RosterRegistrationRepository } from "../contexts/roster/application/get-roster-registration.js";
import type { PlayerProfilePerformanceRepository } from "../contexts/roster/application/get-player-profile-performance.js";
import type { PlayerAwardsRepository } from "../contexts/roster/application/get-player-awards.js";
import type { PlayerHistoryRepository } from "../contexts/roster/application/get-player-history.js";
import type { PlayerManagementRepository } from "../contexts/roster/application/manage-players.js";
import type { PlayerStatisticsRepository } from "../contexts/roster/application/get-player-statistics.js";
import type {
  PlayerAvatarStorage,
  PlayerProfileRepository,
} from "../contexts/roster/application/save-player-profile.js";
import type { CallupRepository } from "../contexts/callups/application/manage-callups.js";
import type { RoundRepository } from "../contexts/rounds/application/manage-rounds.js";
import { registerGoalRoutes } from "../contexts/matches/presentation/goals-route.js";
import { registerLeagueRoutes } from "../contexts/leagues/presentation/leagues-route.js";
import { registerLeagueConfigRoutes } from "../contexts/leagues/presentation/league-config-route.js";
import { registerSeasonRoutes } from "../contexts/leagues/presentation/season-route.js";
import { registerStadiumRoutes } from "../contexts/leagues/presentation/stadium-route.js";
import { registerLeagueEntryRoutes } from "../contexts/leagues/presentation/league-entry-route.js";
import { registerLeagueBrandingRoutes } from "../contexts/leagues/presentation/league-branding-route.js";
import { registerAccountAccessRoutes } from "../contexts/identity/presentation/account-access-route.js";
import { registerAuthenticationRoutes } from "../contexts/identity/presentation/authentication-route.js";
import { registerAccountCareerRoutes } from "../contexts/roster/presentation/account-career-route.js";
import { registerPrivateBalanceTagRoutes } from "../contexts/roster/presentation/private-balance-tag-route.js";
import { registerFitnessRoutes } from "../contexts/roster/presentation/fitness-route.js";
import { registerSpeedRatingRoutes } from "../contexts/roster/presentation/speed-rating-route.js";
import { registerRosterActivityRoutes } from "../contexts/roster/presentation/roster-activity-route.js";
import { registerPlayerCatalogRoutes } from "../contexts/roster/presentation/player-catalog-route.js";
import { registerRosterRegistrationRoutes } from "../contexts/roster/presentation/roster-registration-route.js";
import { registerPlayerProfilePerformanceRoutes } from "../contexts/roster/presentation/player-profile-performance-route.js";
import { registerPlayerAwardsRoutes } from "../contexts/roster/presentation/player-awards-route.js";
import { registerPlayerHistoryRoutes } from "../contexts/roster/presentation/player-history-route.js";
import { registerPlayerManagementRoutes } from "../contexts/roster/presentation/player-management-route.js";
import { registerPlayerStatisticsRoutes } from "../contexts/roster/presentation/player-statistics-route.js";
import { registerPlayerProfileRoutes } from "../contexts/roster/presentation/player-profile-route.js";
import { registerCallupRoutes } from "../contexts/callups/presentation/callups-route.js";
import { registerRoundRoutes } from "../contexts/rounds/presentation/rounds-route.js";
import { registerMatchRoutes } from "../contexts/matches/presentation/matches-route.js";
import { registerInboxRoutes } from "../contexts/notifications/presentation/inbox-route.js";
import { registerPreferencesRoutes } from "../contexts/notifications/presentation/preferences-route.js";
import { registerDeliveryRoutes } from "../contexts/notifications/presentation/delivery-route.js";
import { manageDelivery } from "../contexts/notifications/application/manage-delivery.js";
import { registerCartolaReminderRoutes } from "../contexts/notifications/presentation/cartola-reminder-route.js";
import { manageCartolaReminders } from "../contexts/notifications/application/manage-cartola-reminders.js";
import type {
  CartolaReminderEmailSender,
  CartolaReminderRepository,
  CartolaReminderScheduler,
} from "../contexts/notifications/application/manage-cartola-reminders.js";
import type { InboxRepository } from "../contexts/notifications/application/manage-inbox.js";
import type {
  CartolaEmailSender,
  LeagueNotificationSettingsRepository,
  PushAlertScheduler,
  PushDeliverySubscriptionRepository,
  PushNotificationSender,
} from "../contexts/notifications/application/manage-delivery.js";
import type {
  NotificationPreferencesRepository,
  PushConfigurationProvider,
  PushSubscriptionRepository,
} from "../contexts/notifications/application/manage-preferences.js";
import type { MatchRepository, MatchTimerScheduler } from "../contexts/matches/application/manage-matches.js";
import type { ScoringRulesRepository } from "../contexts/statistics/application/manage-scoring-rules.js";
import { registerScoringRulesRoutes } from "../contexts/statistics/presentation/scoring-rules-route.js";
import type { SeasonRankingRepository } from "../contexts/statistics/application/manage-season-ranking.js";
import { registerSeasonRankingRoutes } from "../contexts/statistics/presentation/season-ranking-route.js";
import type { UserVerifier } from "../infrastructure/auth-user-verifier.js";

export function createApp(dependencies: {
  goalsEnabled: boolean;
  leaguesEnabled?: boolean;
  identityEnabled?: boolean;
  rosterEnabled?: boolean;
  callupsEnabled?: boolean;
  roundsEnabled?: boolean;
  matchesEnabled?: boolean;
  notificationsEnabled?: boolean;
  statisticsEnabled?: boolean;
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
  accountAccessRepository?: AccountAccessRepository;
  identityAuthProvider?: IdentityAuthProvider;
  identityProfileRepository?: IdentityProfileRepository;
  appPublicUrl?: string;
  accountCareerRepository?: AccountCareerRepository;
  privateBalanceTagRepository?: PrivateBalanceTagRepository;
  fitnessRepository?: FitnessRepository;
  speedRatingRepository?: SpeedRatingRepository;
  rosterActivityRepository?: RosterActivityRepository;
  playerCatalogRepository?: PlayerCatalogRepository;
  rosterRegistrationRepository?: RosterRegistrationRepository;
  playerProfilePerformanceRepository?: PlayerProfilePerformanceRepository;
  playerAwardsRepository?: PlayerAwardsRepository;
  playerHistoryRepository?: PlayerHistoryRepository;
  playerManagementRepository?: PlayerManagementRepository;
  playerStatisticsRepository?: PlayerStatisticsRepository;
  playerProfileRepository?: PlayerProfileRepository;
  playerAvatarStorage?: PlayerAvatarStorage;
  callupRepository?: CallupRepository;
  roundRepository?: RoundRepository;
  matchRepository?: MatchRepository;
  matchTimerScheduler?: MatchTimerScheduler;
  matchTimerWebhookSecret?: string;
  inboxRepository?: InboxRepository;
  pushConfig?: PushConfigurationProvider;
  pushSubscriptions?: PushSubscriptionRepository;
  pushAlertScheduler?: PushAlertScheduler;
  pushNotificationSender?: PushNotificationSender;
  pushDeliverySubscriptions?: PushDeliverySubscriptionRepository;
  cartolaEmailSender?: CartolaEmailSender;
  leagueNotificationSettings?: LeagueNotificationSettingsRepository;
  cartolaReminderRepository?: CartolaReminderRepository;
  cartolaReminderScheduler?: CartolaReminderScheduler;
  cartolaReminderEmailSender?: CartolaReminderEmailSender;
  cartolaUnsubscribeSecret?: string;
  preferencesRepository?: NotificationPreferencesRepository;
  scoringRulesRepository?: ScoringRulesRepository;
  seasonRankingRepository?: SeasonRankingRepository;
  emailConfigured?: boolean;
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
  if (dependencies.identityEnabled && (!dependencies.accountAccessRepository || !dependencies.identityAuthProvider
    || !dependencies.identityProfileRepository || !dependencies.appPublicUrl)) {
    throw new Error("Dependências de identidade são obrigatórias quando ENABLE_IDENTITY_API=true.");
  }
  if (dependencies.rosterEnabled && (!dependencies.accountCareerRepository || !dependencies.privateBalanceTagRepository
    || !dependencies.fitnessRepository || !dependencies.speedRatingRepository || !dependencies.rosterActivityRepository
    || !dependencies.playerCatalogRepository || !dependencies.rosterRegistrationRepository
    || !dependencies.playerProfilePerformanceRepository || !dependencies.playerAwardsRepository
    || !dependencies.playerHistoryRepository || !dependencies.playerManagementRepository
    || !dependencies.playerStatisticsRepository || !dependencies.playerProfileRepository
    || !dependencies.playerAvatarStorage)) {
    throw new Error("Dependências de elenco são obrigatórias quando ENABLE_ROSTER_API=true.");
  }
  if (dependencies.callupsEnabled && !dependencies.callupRepository) {
    throw new Error("CallupRepository é obrigatório quando ENABLE_CALLUPS_API=true.");
  }
  if (dependencies.roundsEnabled && !dependencies.roundRepository) {
    throw new Error("RoundRepository é obrigatório quando ENABLE_ROUNDS_API=true.");
  }
  if (dependencies.matchesEnabled && (!dependencies.matchRepository || !dependencies.matchTimerScheduler)) {
    throw new Error("MatchRepository e MatchTimerScheduler são obrigatórios quando ENABLE_MATCHES_API=true.");
  }
  if (dependencies.notificationsEnabled && (!dependencies.inboxRepository || !dependencies.pushConfig || !dependencies.pushSubscriptions || !dependencies.preferencesRepository)) {
    throw new Error("Dependências de notificações são obrigatórias quando ENABLE_NOTIFICATIONS_API=true.");
  }
  if (dependencies.statisticsEnabled && !dependencies.scoringRulesRepository) {
    throw new Error("ScoringRulesRepository é obrigatório quando ENABLE_STATISTICS_API=true.");
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
  if (dependencies.identityEnabled && dependencies.accountAccessRepository && dependencies.identityAuthProvider
    && dependencies.identityProfileRepository && dependencies.appPublicUrl) {
    registerAccountAccessRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.accountAccessRepository,
    });
    registerAuthenticationRoutes(app, {
      verifier: dependencies.verifier,
      provider: dependencies.identityAuthProvider,
      profiles: dependencies.identityProfileRepository,
      appPublicUrl: dependencies.appPublicUrl,
    });
  }
  if (dependencies.rosterEnabled && dependencies.accountCareerRepository && dependencies.privateBalanceTagRepository
    && dependencies.fitnessRepository && dependencies.speedRatingRepository && dependencies.rosterActivityRepository
    && dependencies.playerCatalogRepository && dependencies.rosterRegistrationRepository
    && dependencies.playerProfilePerformanceRepository && dependencies.playerAwardsRepository
    && dependencies.playerHistoryRepository && dependencies.playerManagementRepository
    && dependencies.playerStatisticsRepository && dependencies.playerProfileRepository
    && dependencies.playerAvatarStorage) {
    registerAccountCareerRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.accountCareerRepository,
    });
    registerPrivateBalanceTagRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.privateBalanceTagRepository,
    });
    registerFitnessRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.fitnessRepository,
    });
    registerSpeedRatingRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.speedRatingRepository,
    });
    registerRosterActivityRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.rosterActivityRepository,
    });
    registerPlayerCatalogRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.playerCatalogRepository,
    });
    registerPlayerManagementRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.playerManagementRepository,
    });
    registerPlayerStatisticsRoutes(app, {
      verifier: dependencies.verifier,
      catalog: dependencies.playerCatalogRepository,
      statistics: dependencies.playerStatisticsRepository,
    });
    registerPlayerProfileRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.playerProfileRepository,
      storage: dependencies.playerAvatarStorage,
    });
    registerRosterRegistrationRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.rosterRegistrationRepository,
    });
    registerPlayerProfilePerformanceRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.playerProfilePerformanceRepository,
    });
    registerPlayerAwardsRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.playerAwardsRepository,
    });
    registerPlayerHistoryRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.playerHistoryRepository,
    });
  }
  if (dependencies.callupsEnabled && dependencies.callupRepository) {
    registerCallupRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.callupRepository,
    });
  }
  if (dependencies.roundsEnabled && dependencies.roundRepository) {
    registerRoundRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.roundRepository,
    });
  }
  if (dependencies.matchesEnabled && dependencies.matchRepository && dependencies.matchTimerScheduler) {
    registerMatchRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.matchRepository,
      timerScheduler: dependencies.matchTimerScheduler,
      webhookSecret: dependencies.matchTimerWebhookSecret,
    });
  }
  if (dependencies.notificationsEnabled && dependencies.inboxRepository) {
    registerInboxRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.inboxRepository,
    });
  }
  if (dependencies.notificationsEnabled && dependencies.pushConfig && dependencies.pushSubscriptions && dependencies.preferencesRepository) {
    registerPreferencesRoutes(app, {
      verifier: dependencies.verifier,
      pushConfig: dependencies.pushConfig,
      pushSubscriptions: dependencies.pushSubscriptions,
      preferences: dependencies.preferencesRepository,
      emailConfigured: dependencies.emailConfigured ?? false,
    });
  }
  if (
    dependencies.notificationsEnabled
    && dependencies.pushAlertScheduler
    && dependencies.pushNotificationSender
    && dependencies.pushDeliverySubscriptions
    && dependencies.pushConfig
    && dependencies.cartolaEmailSender
    && dependencies.leagueNotificationSettings
  ) {
    const deliveryService = manageDelivery({
      pushScheduler: dependencies.pushAlertScheduler,
      pushSender: dependencies.pushNotificationSender,
      pushSubscriptions: dependencies.pushDeliverySubscriptions,
      pushConfig: dependencies.pushConfig,
      emailSender: dependencies.cartolaEmailSender,
      leagueSettings: dependencies.leagueNotificationSettings,
    });
    registerDeliveryRoutes(app, {
      verifier: dependencies.verifier,
      deliveryService,
      webhookSecret: dependencies.matchTimerWebhookSecret,
    });
  }
  if (
    dependencies.notificationsEnabled
    && dependencies.cartolaReminderRepository
    && dependencies.cartolaReminderScheduler
    && dependencies.cartolaReminderEmailSender
    && dependencies.pushNotificationSender
    && dependencies.pushDeliverySubscriptions
  ) {
    const cartolaService = manageCartolaReminders({
      repository: dependencies.cartolaReminderRepository,
      scheduler: dependencies.cartolaReminderScheduler,
      pushSender: dependencies.pushNotificationSender,
      pushSubscriptions: dependencies.pushDeliverySubscriptions,
      emailSender: dependencies.cartolaReminderEmailSender,
      unsubscribeSecret: dependencies.cartolaUnsubscribeSecret,
    });
    registerCartolaReminderRoutes(app, {
      verifier: dependencies.verifier,
      cartolaService,
      scheduler: dependencies.cartolaReminderScheduler,
      webhookSecret: dependencies.matchTimerWebhookSecret,
    });
  }
  if (dependencies.statisticsEnabled && dependencies.scoringRulesRepository) {
    registerScoringRulesRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.scoringRulesRepository,
    });
  }
  if (dependencies.statisticsEnabled && dependencies.seasonRankingRepository) {
    registerSeasonRankingRoutes(app, {
      verifier: dependencies.verifier,
      repository: dependencies.seasonRankingRepository,
    });
  }
  return app;
}
