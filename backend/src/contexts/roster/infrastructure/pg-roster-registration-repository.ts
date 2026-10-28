import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { RosterRegistrationRepository } from "../application/get-roster-registration.js";
import type { PlayerRegistrationEvent } from "../domain/roster-registration.js";
import {
  playerCatalogProjection,
  playerCatalogRecordFromRow,
  type PlayerCatalogRow,
} from "./pg-player-catalog-repository.js";

export class RosterRegistrationPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "RosterRegistrationPersistenceError";
  }
}

type RegistrationRow = Omit<PlayerRegistrationEvent, "id" | "created_at"> & {
  id: string | number;
  created_at: string | Date;
};

function translateFailure(cause: unknown): RosterRegistrationPersistenceError {
  if (cause instanceof RosterRegistrationPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/ROSTER_REGISTRATION_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new RosterRegistrationPersistenceError("Somente administradores da pelada podem acessar cadastros.", 403);
  }
  return new RosterRegistrationPersistenceError("Não foi possível carregar os cadastros do elenco.", 503);
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

async function requireLeagueAdmin(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
  );
  if (access.rows[0]?.allowed !== true) throw new Error("ROSTER_REGISTRATION_FORBIDDEN");
}

function registrationEvent(row: RegistrationRow): PlayerRegistrationEvent {
  return {
    ...row,
    id: Number(row.id),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

export function pgRosterRegistrationRepository(pool: Pool): RosterRegistrationRepository {
  return {
    listHistory: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const result = await client.query<RegistrationRow>(
        `SELECT event.id, event.player_id,
                COALESCE(player.name, event.player_name) AS player_name,
                COALESCE(NULLIF(player.avatar_url, ''), event.avatar_url) AS avatar_url,
                COALESCE(player.member_category, event.member_category) AS member_category,
                event.source, event.created_by_user_id, event.created_at
           FROM public.player_registration_events event
           JOIN public.league_members member ON member.player_id = event.player_id
             AND member.league_id = $1::uuid AND member.is_active
           LEFT JOIN public.players player ON player.id = event.player_id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1000`,
        [leagueId],
      );
      return result.rows.map(registrationEvent);
    }),

    listMergeCandidates: (leagueId, guestId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const result = await client.query<PlayerCatalogRow>(
        `${playerCatalogProjection}
          WHERE member.league_id = $1::uuid AND member.is_active
            AND player.id <> $2::uuid AND player.is_selectable
            AND player.member_category IN ('player', 'guest')
            AND EXISTS (
              SELECT 1 FROM public.league_members target
               WHERE target.league_id = $1::uuid AND target.player_id = $2::uuid AND target.is_active
            )
          ORDER BY player.name ASC, player.id ASC`,
        [leagueId, guestId],
      );
      return result.rows.map(playerCatalogRecordFromRow);
    }),

    mergePlayers: (leagueId, guestId, registeredId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const check = await client.query<{ can_merge: boolean }>(
        "SELECT public.can_merge_profiles_in_league($1::uuid, $2::uuid, $3::uuid) AS can_merge",
        [leagueId, guestId, registeredId],
      );
      if (!check.rows[0]?.can_merge) {
        throw new RosterRegistrationPersistenceError(
          "A união de perfis usados em outra pelada exige uma rotina de migração própria.", 409,
        );
      }
      const result = await client.query<{ affected_rounds: string[] | null }>(
        "SELECT public.merge_selectable_player_profiles($1::uuid, $2::uuid) AS affected_rounds",
        [guestId, registeredId],
      );
      const rounds = result.rows[0]?.affected_rounds;
      return Array.isArray(rounds) ? rounds.map(String) : [];
    }),
  };
}
