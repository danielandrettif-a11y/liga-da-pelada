import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { RosterActivityRepository } from "../application/manage-roster-activity.js";
import type { UnreadRosterEvent } from "../domain/roster-activity.js";

export class RosterActivityPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "RosterActivityPersistenceError";
  }
}

function translateFailure(cause: unknown): RosterActivityPersistenceError {
  if (cause instanceof RosterActivityPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/ROSTER_ACTIVITY_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new RosterActivityPersistenceError("Somente administradores da pelada podem acessar esta leitura.", 403);
  }
  return new RosterActivityPersistenceError("Não foi possível acessar as novidades do elenco.", 503);
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
  if (access.rows[0]?.allowed !== true) throw new Error("ROSTER_ACTIVITY_FORBIDDEN");
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readMarker(client: PoolClient, leagueId: string): Promise<string | null> {
  const result = await client.query<{ last_seen_at: string | Date }>(
    `SELECT last_seen_at
       FROM public.admin_roster_reads
      WHERE user_id = auth.uid() AND league_id = $1::uuid`,
    [leagueId],
  );
  return result.rows[0] ? iso(result.rows[0].last_seen_at) : null;
}

export function pgRosterActivityRepository(pool: Pool): RosterActivityRepository {
  return {
    getUnreadState: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const lastSeenAt = await readMarker(client, leagueId);
      if (!lastSeenAt) return { count: 0, lastSeenAt: null };
      const result = await client.query<{ count: string | number }>(
        `SELECT count(*) AS count
           FROM public.player_registration_events event
           JOIN public.league_members member ON member.player_id = event.player_id
          WHERE member.league_id = $1::uuid AND member.is_active
            AND event.created_at > $2::timestamptz`,
        [leagueId, lastSeenAt],
      );
      return { count: Number(result.rows[0]?.count || 0), lastSeenAt };
    }),

    listUnreadEvents: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const lastSeenAt = await readMarker(client, leagueId);
      if (!lastSeenAt) return [];
      const result = await client.query<{ player_id: string; created_at: string | Date }>(
        `SELECT event.player_id, event.created_at
           FROM public.player_registration_events event
           JOIN public.league_members member ON member.player_id = event.player_id
          WHERE member.league_id = $1::uuid AND member.is_active
            AND event.player_id IS NOT NULL AND event.created_at > $2::timestamptz
          ORDER BY event.created_at ASC, event.id ASC`,
        [leagueId, lastSeenAt],
      );
      return result.rows.map((row): UnreadRosterEvent => ({
        playerId: row.player_id, createdAt: iso(row.created_at),
      }));
    }),

    markSeenThrough: (leagueId, seenThrough, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      await client.query(
        "SELECT public.mark_roster_activity_seen_through($1::uuid, $2::timestamptz)",
        [leagueId, seenThrough],
      );
    }),

    markSeen: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      await client.query("SELECT public.mark_roster_activity_seen($1::uuid)", [leagueId]);
    }),
  };
}
