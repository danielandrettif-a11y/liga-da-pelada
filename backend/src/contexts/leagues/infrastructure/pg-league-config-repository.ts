import type { Pool, PoolClient } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { LeagueConfig, LeagueConfigRepository } from "../application/manage-league-config.js";

export class LeagueConfigPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueConfigPersistenceError";
  }
}

function translateConfigFailure(cause: unknown): LeagueConfigPersistenceError {
  const error = cause as Error & { code?: string };
  if (error.code === "23505") return new LeagueConfigPersistenceError("Já existe uma pelada com esse nome.", 409);
  if (error.message === "LEAGUE_ADMIN_REQUIRED") {
    return new LeagueConfigPersistenceError("Somente o ADM desta pelada pode concluir a operação.", 403);
  }
  if (error.message === "LEAGUE_NOT_FOUND") {
    return new LeagueConfigPersistenceError("Pelada não encontrada.", 404);
  }
  if (error.message === "ACTIVE_CALLUP_FORMAT") {
    return new LeagueConfigPersistenceError(
      "Feche ou conclua a convocação atual antes de mudar o formato da rodada.",
      409,
    );
  }
  return new LeagueConfigPersistenceError("Não foi possível atualizar a pelada.", 503);
}

async function assertAdmin(client: PoolClient, leagueId: string) {
  const result = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed",
    [leagueId],
  );
  if (result.rows[0]?.allowed !== true) throw new Error("LEAGUE_ADMIN_REQUIRED");
}

export function pgLeagueConfigRepository(pool: Pool): LeagueConfigRepository {
  return {
    async getConfig(leagueId, actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<LeagueConfig>(`
            SELECT league.id,
                   league.name,
                   league.match_duration,
                   league.players_per_team,
                   league.teams_per_round,
                   league.preseason_enabled,
                   league.stadium_name,
                   league.stadium_map_url,
                   league.event_duration_minutes,
                   league.visibility,
                   league.logo_url,
                   league.cover_url,
                   COALESCE(league.accent_color, '#ccff00') AS accent_color,
                   (member.role = 'admin') AS can_manage
              FROM public.leagues league
              JOIN public.league_members member
                ON member.league_id = league.id
               AND member.user_id = auth.uid()
               AND member.is_active = true
             WHERE league.id = $1::uuid
               AND league.is_active = true
             LIMIT 1
          `, [leagueId]);
          const config = result.rows[0];
          if (!config) throw new Error("LEAGUE_NOT_FOUND");
          return config;
        });
      } catch (error) {
        throw translateConfigFailure(error);
      }
    },

    async updateName(leagueId, name, actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);
          const result = await client.query<{ name: string }>(`
            UPDATE public.leagues
               SET name = $2::text
             WHERE id = $1::uuid
               AND is_active = true
            RETURNING name
          `, [leagueId, name]);
          const updated = result.rows[0]?.name;
          if (!updated) throw new Error("LEAGUE_NOT_FOUND");
          return updated;
        });
      } catch (error) {
        throw translateConfigFailure(error);
      }
    },

    async updateSettings(leagueId, settings, actor) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);
          const currentResult = await client.query<{ players_per_team: number; teams_per_round: number }>(`
            SELECT players_per_team, teams_per_round
              FROM public.leagues
             WHERE id = $1::uuid
               AND is_active = true
             FOR UPDATE
          `, [leagueId]);
          const current = currentResult.rows[0];
          if (!current) throw new Error("LEAGUE_NOT_FOUND");
          if (current.players_per_team !== settings.playersPerTeam
            || current.teams_per_round !== settings.teamsPerRound) {
            const active = await client.query(`
              SELECT 1
                FROM public.callups
               WHERE league_id = $1::uuid
                 AND status IN ('open', 'locked')
               LIMIT 1
            `, [leagueId]);
            if (active.rows[0]) throw new Error("ACTIVE_CALLUP_FORMAT");
          }
          await client.query(`
            UPDATE public.leagues
               SET match_duration = $2::integer,
                   players_per_team = $3::integer,
                   teams_per_round = $4::integer,
                   stadium_name = $5::text,
                   stadium_map_url = $6::text,
                   event_duration_minutes = $7::integer
             WHERE id = $1::uuid
          `, [
            leagueId,
            settings.matchDuration,
            settings.playersPerTeam,
            settings.teamsPerRound,
            settings.stadiumName,
            settings.stadiumMapUrl,
            settings.eventDurationMinutes,
          ]);
        });
      } catch (error) {
        throw translateConfigFailure(error);
      }
    },

    async setPreseason(leagueId, enabled, actor) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);
          const result = await client.query(`
            UPDATE public.leagues
               SET preseason_enabled = $2::boolean
             WHERE id = $1::uuid
               AND is_active = true
            RETURNING id
          `, [leagueId, enabled]);
          if (!result.rows[0]) throw new Error("LEAGUE_NOT_FOUND");
        });
      } catch (error) {
        throw translateConfigFailure(error);
      }
    },
  };
}
