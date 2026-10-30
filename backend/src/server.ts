import pg from "pg";
import { supabaseUserVerifier } from "./infrastructure/auth-user-verifier.js";
import { pgGoalRepository } from "./contexts/matches/infrastructure/pg-goal-repository.js";
import { pgLeagueRepository } from "./contexts/leagues/infrastructure/pg-league-repository.js";
import { pgLeagueMembershipRequestRepository } from "./contexts/leagues/infrastructure/pg-league-membership-request-repository.js";
import { pgLeagueLobbyRepository } from "./contexts/leagues/infrastructure/pg-league-lobby-repository.js";
import { pgLeagueAdminRepository } from "./contexts/leagues/infrastructure/pg-league-admin-repository.js";
import { pgLeagueConfigRepository } from "./contexts/leagues/infrastructure/pg-league-config-repository.js";
import { pgQuickMatchRepository } from "./contexts/leagues/infrastructure/pg-quick-match-repository.js";
import { pgSeasonRepository } from "./contexts/leagues/infrastructure/pg-season-repository.js";
import { pgStadiumRepository } from "./contexts/leagues/infrastructure/pg-stadium-repository.js";
import { pgLeagueEntryRepository } from "./contexts/leagues/infrastructure/pg-league-entry-repository.js";
import { pgLeagueBrandingRepository } from "./contexts/leagues/infrastructure/pg-league-branding-repository.js";
import { supabaseLeagueBrandingStorage } from "./contexts/leagues/infrastructure/supabase-league-branding-storage.js";
import { pgAccountAccessRepository } from "./contexts/identity/infrastructure/pg-account-access-repository.js";
import { pgIdentityProfileRepository } from "./contexts/identity/infrastructure/pg-identity-profile-repository.js";
import { supabaseIdentityAuthProvider } from "./contexts/identity/infrastructure/supabase-identity-auth-provider.js";
import { pgAccountCareerRepository } from "./contexts/roster/infrastructure/pg-account-career-repository.js";
import { pgPrivateBalanceTagRepository } from "./contexts/roster/infrastructure/pg-private-balance-tag-repository.js";
import { pgFitnessRepository } from "./contexts/roster/infrastructure/pg-fitness-repository.js";
import { pgSpeedRatingRepository } from "./contexts/roster/infrastructure/pg-speed-rating-repository.js";
import { pgRosterActivityRepository } from "./contexts/roster/infrastructure/pg-roster-activity-repository.js";
import { pgPlayerCatalogRepository } from "./contexts/roster/infrastructure/pg-player-catalog-repository.js";
import { pgRosterRegistrationRepository } from "./contexts/roster/infrastructure/pg-roster-registration-repository.js";
import { pgPlayerProfilePerformanceRepository } from "./contexts/roster/infrastructure/pg-player-profile-performance-repository.js";
import { pgPlayerAwardsRepository } from "./contexts/roster/infrastructure/pg-player-awards-repository.js";
import { pgPlayerHistoryRepository } from "./contexts/roster/infrastructure/pg-player-history-repository.js";
import { pgPlayerManagementRepository } from "./contexts/roster/infrastructure/pg-player-management-repository.js";
import { pgPlayerStatisticsRepository } from "./contexts/roster/infrastructure/pg-player-statistics-repository.js";
import { pgPlayerProfileRepository } from "./contexts/roster/infrastructure/pg-player-profile-repository.js";
import { supabasePlayerAvatarStorage } from "./contexts/roster/infrastructure/supabase-player-avatar-storage.js";
import { pgCallupRepository } from "./contexts/callups/infrastructure/pg-callup-repository.js";
import { pgRoundRepository } from "./contexts/rounds/infrastructure/pg-round-repository.js";
import { pgMatchRepository } from "./contexts/matches/infrastructure/pg-match-repository.js";
import { pgInboxRepository } from "./contexts/notifications/infrastructure/pg-inbox-repository.js";
import { pgPushSubscriptionRepository } from "./contexts/notifications/infrastructure/pg-push-subscription-repository.js";
import { pgNotificationPreferencesRepository } from "./contexts/notifications/infrastructure/pg-notification-preferences-repository.js";
import { envPushConfigurationProvider } from "./contexts/notifications/infrastructure/env-push-configuration-provider.js";
import { qstashMatchTimerScheduler } from "./contexts/matches/infrastructure/qstash-match-timer-scheduler.js";
import { qstashPushAlertScheduler } from "./contexts/notifications/infrastructure/qstash-push-alert-scheduler.js";
import { webPushNotificationSender } from "./contexts/notifications/infrastructure/web-push-notification-sender.js";
import { resendCartolaEmailSender } from "./contexts/notifications/infrastructure/resend-cartola-email-sender.js";
import { pgLeagueNotificationSettingsRepository } from "./contexts/notifications/infrastructure/pg-league-notification-settings-repository.js";
import { pgMatchTimerDeliveryRepository } from "./contexts/notifications/infrastructure/pg-match-timer-delivery-repository.js";
import { pgCartolaReminderRepository } from "./contexts/notifications/infrastructure/pg-cartola-reminder-repository.js";
import { qstashCartolaReminderScheduler } from "./contexts/notifications/infrastructure/qstash-cartola-reminder-scheduler.js";
import { resendCartolaReminderEmailSender } from "./contexts/notifications/infrastructure/resend-cartola-reminder-email-sender.js";
import { pgScoringRulesRepository } from "./contexts/statistics/infrastructure/pg-scoring-rules-repository.js";
import { pgSeasonRankingRepository } from "./contexts/statistics/infrastructure/pg-season-ranking-repository.js";
import { pgRoundStatisticsRepository } from "./contexts/statistics/infrastructure/pg-round-statistics-repository.js";
import { pgSeasonOperationsRepository } from "./contexts/statistics/infrastructure/pg-season-operations-repository.js";
import { createApp } from "./presentation/app.js";

const goalsEnabled = process.env.ENABLE_GOAL_API === "true";
const leaguesEnabled = process.env.ENABLE_LEAGUE_API === "true";
const identityEnabled = process.env.ENABLE_IDENTITY_API === "true";
const rosterEnabled = process.env.ENABLE_ROSTER_API === "true";
const callupsEnabled = process.env.ENABLE_CALLUPS_API === "true";
const roundsEnabled = process.env.ENABLE_ROUNDS_API === "true";
const matchesEnabled = process.env.ENABLE_MATCHES_API === "true";
const notificationsEnabled = process.env.ENABLE_NOTIFICATIONS_API === "true";
const statisticsEnabled = process.env.ENABLE_STATISTICS_API === "true";
const port = Number(process.env.PORT || "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT inválida.");
}

const databaseUrl = process.env.DATABASE_URL;
const authUrl = process.env.SUPABASE_INTERNAL_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const publicUrl = process.env.SUPABASE_PUBLIC_URL;
const appPublicUrl = process.env.APP_PUBLIC_URL;
if ((goalsEnabled || leaguesEnabled || identityEnabled || rosterEnabled || callupsEnabled || roundsEnabled || matchesEnabled || notificationsEnabled || statisticsEnabled) && (!databaseUrl || !authUrl || !publishableKey)) {
  throw new Error("APIs habilitadas requerem DATABASE_URL, SUPABASE_INTERNAL_URL e SUPABASE_PUBLISHABLE_KEY.");
}
if ((leaguesEnabled || rosterEnabled) && !publicUrl) {
  throw new Error("ENABLE_LEAGUE_API=true ou ENABLE_ROSTER_API=true requer SUPABASE_PUBLIC_URL para imagens públicas.");
}
if (identityEnabled && (!publicUrl || !appPublicUrl)) {
  throw new Error("ENABLE_IDENTITY_API=true requer SUPABASE_PUBLIC_URL e APP_PUBLIC_URL.");
}
if (matchesEnabled && !appPublicUrl) {
  throw new Error("ENABLE_MATCHES_API=true requer APP_PUBLIC_URL para os webhooks do cronômetro.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
const app = createApp({
  goalsEnabled,
  leaguesEnabled,
  identityEnabled,
  rosterEnabled,
  callupsEnabled,
  roundsEnabled,
  matchesEnabled,
  notificationsEnabled,
  strictContextDependencies: true,
  verifier: supabaseUserVerifier(authUrl || "http://127.0.0.1:54321", publishableKey || ""),
  repository: pgGoalRepository(pool),
  leagueRepository: pgLeagueRepository(pool),
  leagueMembershipRequestRepository: pgLeagueMembershipRequestRepository(pool),
  leagueLobbyRepository: pgLeagueLobbyRepository(pool),
  leagueAdminRepository: pgLeagueAdminRepository(pool),
  leagueConfigRepository: pgLeagueConfigRepository(pool),
  quickMatchRepository: pgQuickMatchRepository(pool),
  seasonRepository: pgSeasonRepository(pool),
  stadiumRepository: pgStadiumRepository(pool),
  leagueEntryRepository: pgLeagueEntryRepository(pool),
  leagueBrandingRepository: pgLeagueBrandingRepository(pool),
  leagueBrandingStorage: supabaseLeagueBrandingStorage(
    authUrl || "http://127.0.0.1:54321", publicUrl || "http://127.0.0.1:54321", publishableKey || "",
  ),
  accountAccessRepository: pgAccountAccessRepository(pool),
  identityProfileRepository: pgIdentityProfileRepository(pool),
  identityAuthProvider: supabaseIdentityAuthProvider(
    authUrl || "http://127.0.0.1:54321", publicUrl || "http://127.0.0.1:54321", publishableKey || "",
  ),
  appPublicUrl,
  accountCareerRepository: pgAccountCareerRepository(pool),
  privateBalanceTagRepository: pgPrivateBalanceTagRepository(pool),
  fitnessRepository: pgFitnessRepository(pool),
  speedRatingRepository: pgSpeedRatingRepository(pool),
  rosterActivityRepository: pgRosterActivityRepository(pool),
  playerCatalogRepository: pgPlayerCatalogRepository(pool),
  rosterRegistrationRepository: pgRosterRegistrationRepository(pool),
  playerProfilePerformanceRepository: pgPlayerProfilePerformanceRepository(pool),
  playerAwardsRepository: pgPlayerAwardsRepository(pool),
  playerHistoryRepository: pgPlayerHistoryRepository(pool),
  playerManagementRepository: pgPlayerManagementRepository(pool),
  playerStatisticsRepository: pgPlayerStatisticsRepository(pool),
  playerProfileRepository: pgPlayerProfileRepository(pool),
  playerAvatarStorage: supabasePlayerAvatarStorage(
    authUrl || "http://127.0.0.1:54321", publicUrl || "http://127.0.0.1:54321", publishableKey || "",
  ),
  callupRepository: pgCallupRepository(pool),
  roundRepository: pgRoundRepository(pool),
  matchRepository: pgMatchRepository(pool),
  matchTimerScheduler: qstashMatchTimerScheduler({
    appPublicUrl: appPublicUrl || "http://localhost:3000",
    token: process.env.QSTASH_TOKEN,
    webhookSecret: process.env.MATCH_TIMER_WEBHOOK_SECRET,
    qstashUrl: process.env.QSTASH_URL,
  }),
  matchTimerWebhookSecret: process.env.MATCH_TIMER_WEBHOOK_SECRET,
  inboxRepository: pgInboxRepository(pool),
  pushConfig: envPushConfigurationProvider(process.env),
  pushSubscriptions: pgPushSubscriptionRepository(pool),
  pushDeliverySubscriptions: pgPushSubscriptionRepository(pool),
  pushAlertScheduler: qstashPushAlertScheduler({
    appPublicUrl: appPublicUrl || "http://localhost:3000",
    token: process.env.QSTASH_TOKEN,
    webhookSecret: process.env.MATCH_TIMER_WEBHOOK_SECRET,
    qstashUrl: process.env.QSTASH_URL,
  }),
  pushNotificationSender: webPushNotificationSender({
    pushConfig: envPushConfigurationProvider(process.env),
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  }),
  cartolaEmailSender: resendCartolaEmailSender({
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    unsubscribeSecret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
    appPublicUrl: appPublicUrl || "http://localhost:3000",
  }),
  leagueNotificationSettings: pgLeagueNotificationSettingsRepository(pool),
  matchTimerClaims: pgMatchRepository(pool),
  matchTimerDelivery: pgMatchTimerDeliveryRepository(pool),
  cartolaReminderRepository: pgCartolaReminderRepository(pool),
  cartolaReminderScheduler: qstashCartolaReminderScheduler({
    appPublicUrl: appPublicUrl || "http://localhost:3000",
    token: process.env.QSTASH_TOKEN,
    webhookSecret: process.env.MATCH_TIMER_WEBHOOK_SECRET,
    qstashUrl: process.env.QSTASH_URL,
  }),
  cartolaReminderEmailSender: resendCartolaReminderEmailSender({
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    unsubscribeSecret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
    appPublicUrl: appPublicUrl || "http://localhost:3000",
  }),
  cartolaUnsubscribeSecret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
  preferencesRepository: pgNotificationPreferencesRepository(pool),
  statisticsEnabled,
  scoringRulesRepository: pgScoringRulesRepository(pool),
  seasonRankingRepository: pgSeasonRankingRepository(pool),
  roundStatisticsRepository: pgRoundStatisticsRepository(pool),
  seasonOperationsRepository: pgSeasonOperationsRepository(pool),
  emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.EMAIL_UNSUBSCRIBE_SECRET),
});

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await pool.end();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => pool.end());
  });
}
