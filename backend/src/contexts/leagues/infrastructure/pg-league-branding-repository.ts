import type { Pool, PoolClient } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { LeagueBrandingRepository } from "../application/manage-league-branding.js";

export class LeagueBrandingPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueBrandingPersistenceError";
  }
}

function translate(cause: unknown): LeagueBrandingPersistenceError {
  const error = cause as Error;
  if (/LEAGUE_BRANDING_FORBIDDEN|permission denied|row-level security/i.test(error.message)) {
    return new LeagueBrandingPersistenceError("Somente o ADM desta pelada pode alterar a identidade visual.", 403);
  }
  if (/LEAGUE_BRANDING_NOT_FOUND/i.test(error.message)) {
    return new LeagueBrandingPersistenceError("Pelada não encontrada.", 404);
  }
  return new LeagueBrandingPersistenceError("Não foi possível atualizar a identidade visual.", 503);
}

async function assertAdmin(client: PoolClient, leagueId: string): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
  );
  if (result.rows[0]?.allowed !== true) throw new Error("LEAGUE_BRANDING_FORBIDDEN");
}

export function pgLeagueBrandingRepository(pool: Pool): LeagueBrandingRepository {
  return {
    async getCurrent(leagueId, actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);
          const result = await client.query<{ logo_url: string | null; cover_url: string | null }>(`
            SELECT logo_url, cover_url
              FROM public.leagues
             WHERE id = $1::uuid AND is_active = true
          `, [leagueId]);
          const current = result.rows[0];
          if (!current) throw new Error("LEAGUE_BRANDING_NOT_FOUND");
          return { logoUrl: current.logo_url, coverUrl: current.cover_url };
        });
      } catch (cause) {
        throw translate(cause);
      }
    },

    async update(leagueId, update, actor) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);
          const result = await client.query(`
            UPDATE public.leagues
               SET accent_color = $2::text,
                   logo_url = CASE WHEN $3::boolean THEN $4::text ELSE logo_url END,
                   cover_url = CASE WHEN $5::boolean THEN $6::text ELSE cover_url END
             WHERE id = $1::uuid AND is_active = true
            RETURNING id
          `, [
            leagueId,
            update.accentColor,
            update.logoUrl !== undefined,
            update.logoUrl ?? null,
            update.coverUrl !== undefined,
            update.coverUrl ?? null,
          ]);
          if (!result.rows[0]) throw new Error("LEAGUE_BRANDING_NOT_FOUND");
        });
      } catch (cause) {
        throw translate(cause);
      }
    },
  };
}
