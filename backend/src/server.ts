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
import { createApp } from "./presentation/app.js";

const goalsEnabled = process.env.ENABLE_GOAL_API === "true";
const leaguesEnabled = process.env.ENABLE_LEAGUE_API === "true";
const identityEnabled = process.env.ENABLE_IDENTITY_API === "true";
const rosterEnabled = process.env.ENABLE_ROSTER_API === "true";
const port = Number(process.env.PORT || "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT inválida.");
}

const databaseUrl = process.env.DATABASE_URL;
const authUrl = process.env.SUPABASE_INTERNAL_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const publicUrl = process.env.SUPABASE_PUBLIC_URL;
const appPublicUrl = process.env.APP_PUBLIC_URL;
if ((goalsEnabled || leaguesEnabled || identityEnabled || rosterEnabled) && (!databaseUrl || !authUrl || !publishableKey)) {
  throw new Error("APIs habilitadas requerem DATABASE_URL, SUPABASE_INTERNAL_URL e SUPABASE_PUBLISHABLE_KEY.");
}
if ((leaguesEnabled || rosterEnabled) && !publicUrl) {
  throw new Error("ENABLE_LEAGUE_API=true ou ENABLE_ROSTER_API=true requer SUPABASE_PUBLIC_URL para imagens públicas.");
}
if (identityEnabled && (!publicUrl || !appPublicUrl)) {
  throw new Error("ENABLE_IDENTITY_API=true requer SUPABASE_PUBLIC_URL e APP_PUBLIC_URL.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
const app = createApp({
  goalsEnabled,
  leaguesEnabled,
  identityEnabled,
  rosterEnabled,
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
