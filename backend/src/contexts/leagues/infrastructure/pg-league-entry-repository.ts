import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { LeagueEntryRepository } from "../application/manage-league-entry.js";

export class LeagueEntryPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueEntryPersistenceError";
  }
}

function translate(cause: unknown): LeagueEntryPersistenceError {
  const error = cause as Error;
  if (/LEAGUE_SELECTION_FORBIDDEN|permission denied|row-level security/i.test(error.message)) {
    return new LeagueEntryPersistenceError("Você não possui acesso a esta pelada.", 403);
  }
  return new LeagueEntryPersistenceError("Não foi possível concluir a entrada na pelada.", 503);
}

export function pgLeagueEntryRepository(pool: Pool): LeagueEntryRepository {
  return {
    async completeEntryFlow(version, actor) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          await client.query("SELECT public.complete_my_entry_flow($1::integer)", [version]);
        });
      } catch (cause) {
        throw translate(cause);
      }
    },

    async authorizeSelection(leagueId, mode, actor) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{ allowed: boolean }>(`
            SELECT EXISTS (
              SELECT 1
                FROM public.league_members member
                JOIN public.leagues league ON league.id = member.league_id
               WHERE member.league_id = $1::uuid
                 AND member.user_id = auth.uid()
                 AND member.is_active = true
                 AND league.is_active = true
                 AND (
                   ($2::text = 'active' AND league.archived_at IS NULL)
                   OR ($2::text = 'archived-quick'
                     AND league.feature_tier = 'quick' AND league.archived_at IS NOT NULL)
                 )
            ) AS allowed
          `, [leagueId, mode]);
          if (result.rows[0]?.allowed !== true) throw new Error("LEAGUE_SELECTION_FORBIDDEN");
        });
      } catch (cause) {
        throw translate(cause);
      }
    },
  };
}
