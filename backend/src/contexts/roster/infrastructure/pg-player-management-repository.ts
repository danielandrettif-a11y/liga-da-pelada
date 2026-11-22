import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerManagementRepository } from "../application/manage-players.js";
import type { CreatePlayerCommand, ImportedGuest, UpdatePlayerCommand } from "../domain/player-management.js";
import type { PlayerCatalogRecord } from "../domain/player-catalog.js";
import {
  playerCatalogProjection,
  playerCatalogRecordFromRow,
  type PlayerCatalogRow,
} from "./pg-player-catalog-repository.js";

export class PlayerManagementPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerManagementPersistenceError";
  }
}

function translateFailure(cause: unknown): PlayerManagementPersistenceError {
  if (cause instanceof PlayerManagementPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_MANAGEMENT_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new PlayerManagementPersistenceError("Acesso restrito a esta operação.", 403);
  }
  if (/PLAYER_MANAGEMENT_NOT_FOUND|Pelada nao encontrada/i.test(message)) {
    return new PlayerManagementPersistenceError("Jogador não encontrado nesta pelada.", 404);
  }
  if (/PLAYER_MANAGEMENT_NO_ALTERNATE/i.test(message)) {
    return new PlayerManagementPersistenceError("Adicione uma foto extra antes de alternar.", 409);
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return new PlayerManagementPersistenceError("Já existe um cadastro com esses dados.", 409);
  }
  return new PlayerManagementPersistenceError("Não foi possível alterar o elenco.", 503);
}

async function authenticated<T>(
  pool: Pool, actor: Actor, operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

async function requireLeagueAdmin(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
  );
  if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_MANAGEMENT_FORBIDDEN");
}

async function readPlayer(
  client: PoolClient, leagueId: string, playerId: string,
): Promise<PlayerCatalogRecord> {
  const result = await client.query<PlayerCatalogRow>(
    `${playerCatalogProjection}
      WHERE member.league_id = $1::uuid AND member.player_id = $2::uuid AND member.is_active
      LIMIT 1`,
    [leagueId, playerId],
  );
  if (!result.rows[0]) throw new Error("PLAYER_MANAGEMENT_NOT_FOUND");
  return playerCatalogRecordFromRow(result.rows[0]);
}

export function pgPlayerManagementRepository(pool: Pool): PlayerManagementRepository {
  return {
    create: (leagueId, command, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const playerId = randomUUID();
      await client.query(
        `INSERT INTO public.players (
           id, name, nickname, avatar_url, player_profile, overall_traits, is_goalkeeper,
           member_category, is_selectable, registration_source, created_by_user_id
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6::text[], false, $7, $8, 'admin', auth.uid())`,
        [playerId, command.name, command.nickname, command.avatarUrl, command.playerProfile,
          command.overallTraits, command.memberCategory, command.isSelectable],
      );
      await client.query(
        `INSERT INTO public.league_members (
           league_id, player_id, role, is_active, player_profile, initial_player_profile,
           overall_traits, overall_seed_mode
         ) VALUES ($1::uuid, $2::uuid, 'player', true, $3, $3, $4::text[], 'observed')`,
        [leagueId, playerId, command.playerProfile, command.overallTraits],
      );
      return readPlayer(client, leagueId, playerId);
    }),

    update: (leagueId, playerId, command, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      await readPlayer(client, leagueId, playerId);

      const playerFields: string[] = [];
      const playerValues: unknown[] = [];
      const addPlayerField = (column: string, value: unknown) => {
        playerValues.push(value);
        playerFields.push(`${column} = $${playerValues.length}`);
      };
      if (command.name !== undefined) addPlayerField("name", command.name);
      if (command.nickname !== undefined) addPlayerField("nickname", command.nickname);
      if (command.avatarUrl !== undefined) addPlayerField("avatar_url", command.avatarUrl);
      if (command.memberCategory !== undefined) addPlayerField("member_category", command.memberCategory);
      if (command.isSelectable !== undefined) addPlayerField("is_selectable", command.isSelectable);
      if (playerFields.length) {
        playerValues.push(playerId);
        await client.query(
          `UPDATE public.players SET ${playerFields.join(", ")} WHERE id = $${playerValues.length}::uuid`,
          playerValues,
        );
      }

      const memberFields: string[] = [];
      const memberValues: unknown[] = [];
      if (command.playerProfile !== undefined) {
        memberValues.push(command.playerProfile);
        memberFields.push(`player_profile = $${memberValues.length}`, `initial_player_profile = $${memberValues.length}`);
      }
      if (command.overallTraits !== undefined) {
        memberValues.push(command.overallTraits);
        memberFields.push(`overall_traits = $${memberValues.length}::text[]`);
      }
      if (memberFields.length) {
        memberValues.push(leagueId, playerId);
        await client.query(
          `UPDATE public.league_members SET ${memberFields.join(", ")}
            WHERE league_id = $${memberValues.length - 1}::uuid
              AND player_id = $${memberValues.length}::uuid AND is_active`,
          memberValues,
        );
      }
      return readPlayer(client, leagueId, playerId);
    }),

    swapAvatars: (leagueId, playerId, actor) => authenticated(pool, actor, async (client) => {
      const membership = await client.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.league_members
           WHERE league_id = $1::uuid AND player_id = $2::uuid AND is_active
         ) AS allowed`,
        [leagueId, playerId],
      );
      if (membership.rows[0]?.allowed !== true) throw new Error("PLAYER_MANAGEMENT_NOT_FOUND");
      const access = await client.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.account_profiles
           WHERE user_id = auth.uid() AND (role = 'admin' OR player_id = $1::uuid)
         ) AS allowed`,
        [playerId],
      );
      if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_MANAGEMENT_FORBIDDEN");
      const player = await client.query<{ avatar_url: string | null; avatar_alternate_url: string | null }>(
        `SELECT avatar_url, avatar_alternate_url FROM public.players WHERE id = $1::uuid FOR UPDATE`, [playerId],
      );
      if (!player.rows[0]) throw new Error("PLAYER_MANAGEMENT_NOT_FOUND");
      if (!player.rows[0].avatar_alternate_url) throw new Error("PLAYER_MANAGEMENT_NO_ALTERNATE");
      await client.query(
        `UPDATE public.players SET avatar_url = $2, avatar_alternate_url = $3 WHERE id = $1::uuid`,
        [playerId, player.rows[0].avatar_alternate_url, player.rows[0].avatar_url],
      );
    }),

    importGuests: (leagueId, names, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const result = await client.query<{
        created_name: string; player_id: string; added_to_callup: boolean;
      }>(
        "SELECT * FROM public.import_league_guest_roster($1::uuid, $2::text[])", [leagueId, names],
      );
      return result.rows.map((row): ImportedGuest => ({
        createdName: row.created_name,
        playerId: row.player_id,
        addedToCallup: row.added_to_callup,
      }));
    }),
  };
}
