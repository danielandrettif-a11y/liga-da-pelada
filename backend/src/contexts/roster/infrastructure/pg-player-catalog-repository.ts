import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerCatalogRepository } from "../application/get-player-catalog.js";
import type {
  MemberCategory,
  OverallSeedMode,
  PlayerCatalogRecord,
  PlayerProfile,
  RegistrationSource,
} from "../domain/player-catalog.js";

export class PlayerCatalogPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerCatalogPersistenceError";
  }
}

export type PlayerCatalogRow = {
  id: string;
  name: string;
  nickname: string | null;
  profile_bio: string | null;
  avatar_url: string | null;
  avatar_alternate_url: string | null;
  player_profile: PlayerProfile | null;
  initial_player_profile: PlayerProfile | null;
  profile_decision_source: "initial" | "overall" | null;
  profile_source_round_id: string | null;
  overall_traits: PlayerProfile[] | null;
  overall_seed_mode: OverallSeedMode;
  is_goalkeeper: boolean;
  member_category: MemberCategory;
  is_selectable: boolean;
  show_fitness_stats: boolean;
  registration_source: RegistrationSource;
  profile_scope: "persistent" | "quick_session";
  created_by_user_id: string | null;
  created_at: string | Date;
  league_player_profile: PlayerProfile | null;
  league_initial_player_profile: PlayerProfile | null;
  league_overall_traits: PlayerProfile[] | null;
  league_overall_seed_mode: OverallSeedMode;
};

export const playerCatalogProjection = `
  SELECT player.id, player.name, player.nickname, player.profile_bio,
         player.avatar_url, player.avatar_alternate_url,
         player.player_profile, player.initial_player_profile,
         player.profile_decision_source, player.profile_source_round_id,
         player.overall_traits, player.overall_seed_mode,
         player.is_goalkeeper, player.member_category, player.is_selectable,
         player.show_fitness_stats, player.registration_source, player.profile_scope,
         player.created_by_user_id, player.created_at,
         member.player_profile AS league_player_profile,
         member.initial_player_profile AS league_initial_player_profile,
         member.overall_traits AS league_overall_traits,
         member.overall_seed_mode AS league_overall_seed_mode
    FROM public.league_members member
    JOIN public.players player ON player.id = member.player_id`;

function translateFailure(cause: unknown): PlayerCatalogPersistenceError {
  if (cause instanceof PlayerCatalogPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_CATALOG_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new PlayerCatalogPersistenceError("Você não pertence a esta pelada.", 403);
  }
  return new PlayerCatalogPersistenceError("Não foi possível carregar os jogadores.", 503);
}

async function authenticated<T>(
  pool: Pool,
  actor: Actor,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

async function requireLeagueMember(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_member($1::uuid) AS allowed", [leagueId],
  );
  if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_CATALOG_FORBIDDEN");
}

export function playerCatalogRecordFromRow(row: PlayerCatalogRow): PlayerCatalogRecord {
  return {
    ...row,
    overall_traits: row.overall_traits ?? [],
    league_overall_traits: row.league_overall_traits ?? [],
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

export function pgPlayerCatalogRepository(pool: Pool): PlayerCatalogRepository {
  return {
    list: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      const result = await client.query<PlayerCatalogRow>(
        `${playerCatalogProjection}
          WHERE member.league_id = $1::uuid AND member.is_active
          ORDER BY member.joined_at ASC, player.id ASC`,
        [leagueId],
      );
      return result.rows.map(playerCatalogRecordFromRow);
    }),

    get: (leagueId, playerId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      const result = await client.query<PlayerCatalogRow>(
        `${playerCatalogProjection}
          WHERE member.league_id = $1::uuid AND member.player_id = $2::uuid AND member.is_active
          LIMIT 1`,
        [leagueId, playerId],
      );
      return result.rows[0] ? playerCatalogRecordFromRow(result.rows[0]) : null;
    }),
  };
}
