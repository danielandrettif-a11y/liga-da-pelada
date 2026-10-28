import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerProfileRepository } from "../application/save-player-profile.js";
import type { PlayerProfileAccess, SavePlayerProfileCommand } from "../domain/player-profile.js";

export class PlayerProfilePersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerProfilePersistenceError";
  }
}

function translateFailure(cause: unknown): PlayerProfilePersistenceError {
  if (cause instanceof PlayerProfilePersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_PROFILE_FORBIDDEN|permission denied|row-level security/i.test(message)) {
    return new PlayerProfilePersistenceError("Acesso restrito a esta operação.", 403);
  }
  if (/PLAYER_PROFILE_NOT_FOUND/i.test(message)) {
    return new PlayerProfilePersistenceError("Jogador não encontrado nesta pelada.", 404);
  }
  if (/foreign key|violates.*constraint/i.test(message)) {
    return new PlayerProfilePersistenceError("Este jogador possui vínculos que impedem a exclusão.", 409);
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return new PlayerProfilePersistenceError("Já existe um cadastro com esses dados.", 409);
  }
  return new PlayerProfilePersistenceError("Não foi possível salvar o perfil do jogador.", 503);
}

async function authenticated<T>(pool: Pool, actor: Actor, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

async function isLeagueAdmin(client: PoolClient, leagueId: string): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
  );
  return result.rows[0]?.allowed === true;
}

type AccessRow = {
  profile_bio: string | null;
  avatar_url: string | null;
  avatar_alternate_url: string | null;
  member_category: "player" | "guest" | "wag" | "supporter";
  is_selectable: boolean;
  player_profile: "offensive" | "midfield" | "defensive" | null;
  overall_traits: ("offensive" | "midfield" | "defensive")[] | null;
  is_goalkeeper: boolean;
  is_owner: boolean;
};

async function readAccess(
  client: PoolClient, leagueId: string, playerId: string | null,
): Promise<PlayerProfileAccess> {
  const admin = await isLeagueAdmin(client, leagueId);
  if (!playerId) return { isLeagueAdmin: admin, isOwner: false, current: null };
  const result = await client.query<AccessRow>(
    `SELECT player.profile_bio, player.avatar_url, player.avatar_alternate_url,
            player.member_category, player.is_selectable,
            COALESCE(member.player_profile, player.player_profile) AS player_profile,
            COALESCE(member.overall_traits, player.overall_traits, ARRAY[]::text[]) AS overall_traits,
            player.is_goalkeeper,
            EXISTS (
              SELECT 1 FROM public.account_profiles profile
              WHERE profile.user_id = auth.uid() AND profile.player_id = player.id
            ) AS is_owner
       FROM public.league_members member
       JOIN public.players player ON player.id = member.player_id
      WHERE member.league_id = $1::uuid AND member.player_id = $2::uuid AND member.is_active
      LIMIT 1`,
    [leagueId, playerId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("PLAYER_PROFILE_NOT_FOUND");
  return {
    isLeagueAdmin: admin,
    isOwner: row.is_owner,
    current: {
      profileBio: row.profile_bio,
      avatarUrl: row.avatar_url,
      avatarAlternateUrl: row.avatar_alternate_url,
      memberCategory: row.member_category,
      isSelectable: row.is_selectable,
      playerProfile: row.player_profile,
      overallTraits: row.overall_traits || [],
      isGoalkeeper: row.is_goalkeeper,
    },
  };
}

async function requireSaveAccess(
  client: PoolClient, leagueId: string, playerId: string | null,
): Promise<PlayerProfileAccess> {
  const access = await readAccess(client, leagueId, playerId);
  if ((!playerId && !access.isLeagueAdmin)
    || (playerId && !access.isLeagueAdmin && !access.isOwner)) {
    throw new Error("PLAYER_PROFILE_FORBIDDEN");
  }
  return access;
}

export function pgPlayerProfileRepository(pool: Pool): PlayerProfileRepository {
  return {
    getSaveAccess: (leagueId, playerId, actor) => authenticated(
      pool, actor, (client) => requireSaveAccess(client, leagueId, playerId),
    ),
    saveProfile: (leagueId, command, creating, actor) => authenticated(pool, actor, async (client) => {
      const access = await requireSaveAccess(client, leagueId, creating ? null : command.playerId);
      if (creating) {
        await client.query(
          `INSERT INTO public.players (
             id, name, nickname, profile_bio, avatar_url, avatar_alternate_url,
             player_profile, overall_traits, is_goalkeeper, member_category, is_selectable,
             registration_source, created_by_user_id
           ) VALUES (
             $1::uuid, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, 'admin', auth.uid()
           )`,
          values(command),
        );
        await client.query(
          `INSERT INTO public.league_members (
             league_id, player_id, role, is_active, player_profile, initial_player_profile,
             overall_traits, overall_seed_mode
           ) VALUES ($1::uuid, $2::uuid, 'player', true, $3, $3, $4::text[], 'observed')`,
          [leagueId, command.playerId, command.playerProfile, command.overallTraits],
        );
        return;
      }

      await client.query(
        `UPDATE public.players
            SET name = $2, nickname = $3, profile_bio = $4, avatar_url = $5,
                avatar_alternate_url = $6, is_goalkeeper = $9,
                member_category = $10, is_selectable = $11
          WHERE id = $1::uuid`,
        values(command),
      );
      if (access.isLeagueAdmin) {
        await client.query(
          `UPDATE public.league_members
              SET player_profile = $3, initial_player_profile = $3, overall_traits = $4::text[]
            WHERE league_id = $1::uuid AND player_id = $2::uuid AND is_active`,
          [leagueId, command.playerId, command.playerProfile, command.overallTraits],
        );
      }
    }),
    delete: (leagueId, playerId, actor) => authenticated(pool, actor, async (client) => {
      if (!await isLeagueAdmin(client, leagueId)) throw new Error("PLAYER_PROFILE_FORBIDDEN");
      const current = await client.query<{ avatar_url: string | null; avatar_alternate_url: string | null }>(
        `SELECT player.avatar_url, player.avatar_alternate_url
           FROM public.league_members member
           JOIN public.players player ON player.id = member.player_id
          WHERE member.league_id = $1::uuid AND member.player_id = $2::uuid AND member.is_active
          FOR UPDATE OF player`,
        [leagueId, playerId],
      );
      if (!current.rows[0]) throw new Error("PLAYER_PROFILE_NOT_FOUND");
      await client.query("DELETE FROM public.players WHERE id = $1::uuid", [playerId]);
      return {
        avatarUrl: current.rows[0].avatar_url,
        avatarAlternateUrl: current.rows[0].avatar_alternate_url,
      };
    }),
  };
}

function values(command: SavePlayerProfileCommand): unknown[] {
  return [
    command.playerId, command.name, command.nickname, command.profileBio,
    command.avatarUrl, command.avatarAlternateUrl, command.playerProfile,
    command.overallTraits, command.isGoalkeeper, command.memberCategory, command.isSelectable,
  ];
}
