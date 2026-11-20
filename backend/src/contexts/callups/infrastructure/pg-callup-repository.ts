import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import { CallupVersionConflict } from "../domain/callup.js";
import type {
  CallupGuestListResult,
  CallupInviteResult,
  CallupRepository,
} from "../application/manage-callups.js";
import type {
  AgendaCallup,
  Callup,
  CallupEntry,
  CallupEntryStatus,
  OpenCallupInput,
  UpdateCallupInput,
} from "../domain/callup.js";

export class CallupPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "CallupPersistenceError";
  }
}

function translateFailure(cause: unknown): CallupPersistenceError {
  if (cause instanceof CallupPersistenceError) return cause;
  const error = cause as Error & { code?: string };
  const message = error.message || "";
  if (error.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    return new CallupPersistenceError("Já existe uma convocação para esta data.", 409);
  }
  if (/CALLUP_FORBIDDEN|Somente administradores|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new CallupPersistenceError("Somente administradores podem realizar esta operação.", 403);
  }
  if (/CALLUP_NOT_FOUND|fora da pelada/i.test(message)) {
    return new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
  }
  return new CallupPersistenceError(message || "Falha na persistência da convocação.", 500);
}

async function authenticated<T>(
  pool: Pool,
  actor: Actor,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    if (cause instanceof CallupVersionConflict) throw cause;
    throw translateFailure(cause);
  }
}

async function guardCallupVersion(client: PoolClient, leagueId: string, callupId: string, expectedVersion?: string) {
  if (expectedVersion === undefined) return;
  const params = [leagueId, callupId, expectedVersion];
  const scope = "id = $2::uuid AND league_id = $1::uuid";
  const current = await client.query<{ matches_version: boolean }>(
    `SELECT updated_at = $3::timestamptz AS matches_version FROM public.callups WHERE ${scope}`,
    params,
  );
  if (!current.rows[0]) throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
  if (!current.rows[0].matches_version) throw new CallupVersionConflict();

  // Reavalia a versão ao adquirir o lock que protege a escrita ou RPC seguinte.
  const locked = await client.query(
    `SELECT id FROM public.callups WHERE ${scope} AND updated_at = $3::timestamptz FOR UPDATE`,
    params,
  );
  if (!locked.rows.length) throw new CallupVersionConflict();
}

async function requireLeagueAdmin(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed",
    [leagueId],
  );
  if (access.rows[0]?.allowed !== true) {
    throw new CallupPersistenceError("Somente administradores podem realizar esta ação.", 403);
  }
}

export function pgCallupRepository(pool: Pool): CallupRepository {
  return {
    async listActive(leagueId: string, actor: Actor, inviteCallupId?: string): Promise<Callup[]> {
      return authenticated(pool, actor, async (client) => {
        let whereClause = "WHERE c.status IN ('open', 'locked', 'converted')";
        const params: unknown[] = [];
        if (inviteCallupId) {
          params.push(inviteCallupId);
          whereClause += ` AND c.id = $${params.length}::uuid`;
        } else if (leagueId) {
          params.push(leagueId);
          whereClause += ` AND c.league_id = $${params.length}::uuid`;
        } else {
          return [];
        }

        const callupsResult = await client.query<{
          id: string;
          league_id: string;
          date: string | Date;
          start_time: string;
          stadium_id: string | null;
          round_type: "friendly" | "official";
          status: "open" | "locked" | "converted" | "cancelled";
          is_public: boolean;
          players_per_team: number;
          teams_per_round: number;
          capacity: number;
          round_id: string | null;
          created_at: string | Date;
          updated_at: string | Date | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          match_duration: number | null;
          goals_to_finish: number | null;
          waitlist_capacity: number;
          invite_token: string;
          created_by: string | null;
          entries: CallupEntry[];
          round: Callup["round"];
        }>(
          `WITH selected_callups AS (
             SELECT c.id, c.league_id, c.date, c.start_time, c.stadium_id, c.round_type,
                    c.status, c.is_public, c.players_per_team, c.teams_per_round,
                    c.capacity, c.round_id, c.created_at,
                    to_json(c.updated_at) #>> '{}' AS updated_at,
                    c.stadium_name, c.stadium_map_url, c.match_duration, c.goals_to_finish,
                    c.waitlist_capacity, c.invite_token, c.created_by
             FROM public.callups c
             ${whereClause}
             AND NOT EXISTS (
               SELECT 1 FROM public.rounds r
               WHERE r.id = c.round_id AND (
                 r.status = 'finished' OR EXISTS (
                   SELECT 1 FROM public.matches m
                   WHERE m.round_id = r.id
                     AND (m.started_at IS NOT NULL OR m.status IN ('live', 'finished', 'in_progress', 'completed'))
                 )
               )
             )
           ), joiners AS MATERIALIZED (
             SELECT * FROM public.get_callup_entry_joiners(ARRAY(SELECT id FROM selected_callups))
           )
           SELECT c.*,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', ce.id, 'callup_id', ce.callup_id, 'player_id', ce.player_id,
                 'status', CASE WHEN ce.status::text IN ('waitlist', 'waitlisted') THEN 'waitlisted' ELSE 'confirmed' END,
                 'position', ce.position, 'created_at', ce.created_at, 'joined_by_name', j.joined_by_name,
                 'player', jsonb_build_object(
                   'id', p.id, 'name', p.name, 'nickname', p.nickname, 'avatar_url', p.avatar_url,
                   'player_profile', p.player_profile, 'is_goalkeeper', COALESCE(p.is_goalkeeper, false),
                   'member_category', p.member_category
                 )
               ) ORDER BY (ce.status::text IN ('waitlist', 'waitlisted')), ce.position)
               FROM public.callup_entries ce
               JOIN public.players p ON p.id = ce.player_id
               LEFT JOIN joiners j ON j.callup_entry_id = ce.id
               WHERE ce.callup_id = c.id
             ), '[]'::jsonb) AS entries,
             (
               SELECT jsonb_build_object(
                 'id', r.id, 'status', r.status,
                 'matches', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object('id', m.id, 'status', m.status, 'started_at', m.started_at))
                   FROM public.matches m WHERE m.round_id = r.id
                 ), '[]'::jsonb),
                 'teams', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                     'id', t.id, 'name', t.name, 'position', t.position, 'color', t.color, 'crest_url', t.crest_url,
                     'team_players', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('player_id', tp.player_id))
                       FROM public.team_players tp WHERE tp.team_id = t.id
                     ), '[]'::jsonb)
                   ) ORDER BY t.position, t.id)
                   FROM public.teams t WHERE t.round_id = r.id
                 ), '[]'::jsonb)
               )
               FROM public.rounds r WHERE r.id = c.round_id
             ) AS round
           FROM selected_callups c
           ORDER BY c.date ASC, c.start_time ASC, c.created_at ASC`,
          params,
        );

        return callupsResult.rows.map((c) => {
          const dateStr = c.date instanceof Date ? c.date.toISOString().slice(0, 10) : String(c.date).slice(0, 10);
          return {
            id: c.id,
            league_id: c.league_id,
            date: dateStr,
            start_time: String(c.start_time).slice(0, 5),
            stadium_id: c.stadium_id,
            stadium_name: c.stadium_name,
            stadium_map_url: c.stadium_map_url,
            match_duration: c.match_duration,
            goals_to_finish: c.goals_to_finish,
            waitlist_capacity: c.waitlist_capacity,
            invite_token: c.invite_token,
            created_by: c.created_by,
            round_type: c.round_type,
            status: c.status,
            is_public: Boolean(c.is_public),
            players_per_team: Number(c.players_per_team),
            teams_per_round: Number(c.teams_per_round),
            capacity: Number(c.capacity),
            round_id: c.round_id,
            created_at: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
            updated_at: c.updated_at instanceof Date ? c.updated_at.toISOString() : c.updated_at ? String(c.updated_at) : undefined,
            entries: c.entries,
            round: c.round,
          };
        });
      });
    },

    async listAgenda(leagueId: string, actor: Actor): Promise<AgendaCallup[]> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{
          id: string;
          league_id: string;
          date: string | Date;
          start_time: string;
          round_type: "friendly" | "official";
          status: "open" | "locked" | "converted" | "cancelled";
          round_id: string | null;
          created_at: string | Date;
          playersCount: string | number;
        }>(
          `SELECT c.id, c.league_id, c.date, c.start_time, c.round_type, c.status, c.round_id, c.created_at,
                  COUNT(ce.id)::int AS "playersCount"
           FROM public.callups c
           LEFT JOIN public.callup_entries ce ON ce.callup_id = c.id
           WHERE c.league_id = $1::uuid
           GROUP BY c.id
           ORDER BY c.date DESC, c.created_at DESC
           LIMIT 80`,
          [leagueId],
        );

        return result.rows.map((row) => ({
          id: row.id,
          league_id: row.league_id,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          start_time: String(row.start_time).slice(0, 5),
          round_type: row.round_type,
          status: row.status,
          round_id: row.round_id,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          playersCount: Number(row.playersCount || 0),
        }));
      });
    },

    async openCallup(
      leagueId: string,
      input: {
        date: string;
        startTime: string;
        stadiumId: string | null;
        roundType: "friendly" | "official";
        playersPerTeam: number;
        teamsPerRound: number;
        capacity: number;
      },
      actor: Actor,
    ): Promise<{ callupId: string; roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);

        let stadiumName: string | null = null;
        let stadiumMapUrl: string | null = null;
        if (input.stadiumId) {
          const stadium = await client.query<{ name: string; google_maps_url: string | null }>(
            "SELECT name, google_maps_url FROM public.stadiums WHERE id = $1::uuid AND league_id = $2::uuid",
            [input.stadiumId, leagueId],
          );
          if (stadium.rows[0]) {
            stadiumName = stadium.rows[0].name;
            stadiumMapUrl = stadium.rows[0].google_maps_url;
          } else {
            throw new CallupPersistenceError("Estádio fora da pelada selecionada.", 400);
          }
        }
        if (!stadiumName) {
          const league = await client.query<{ stadium_name: string | null; stadium_map_url: string | null }>(
            "SELECT stadium_name, stadium_map_url FROM public.leagues WHERE id = $1::uuid",
            [leagueId],
          );
          if (league.rows[0]) {
            stadiumName = league.rows[0].stadium_name;
            stadiumMapUrl = league.rows[0].stadium_map_url;
          }
        }

        const result = await client.query<{ create_league_callup: string }>(
          `SELECT public.create_league_callup(
             $1::uuid, $2::date, $3::time, $4::uuid, $5::text, $6::text,
             $7::text, $8::int, $9::int, $10::int
           )`,
          [
            leagueId,
            input.date,
            input.startTime,
            input.stadiumId,
            stadiumName,
            stadiumMapUrl,
            input.roundType,
            input.capacity,
            input.playersPerTeam,
            input.teamsPerRound,
          ],
        );

        const callupId = result.rows[0]?.create_league_callup;
        if (!callupId) throw new CallupPersistenceError("Não foi possível criar a convocação.", 500);
        const prelist = await client.query<{ save_round_prelist: string }>(
          `SELECT public.save_round_prelist(
             $1::uuid, NULL::uuid, $2::date, $3::time, $4::text,
             ARRAY[]::uuid[], $5::uuid, $6::uuid, $7::text, $8::text
           )`,
          [
            leagueId,
            input.date,
            input.startTime,
            input.roundType,
            callupId,
            input.stadiumId,
            stadiumName,
            stadiumMapUrl,
          ],
        );
        const roundId = prelist.rows[0]?.save_round_prelist;
        if (!roundId) throw new CallupPersistenceError("Não foi possível preparar a pré-lista.", 500);
        return { callupId: String(callupId), roundId: String(roundId) };
      });
    },

    async updateCallup(
      leagueId: string,
      callupId: string,
      input: {
        date: string;
        startTime: string;
        stadiumId: string | null;
        roundType: "friendly" | "official";
      },
      actor: Actor,
      expectedVersion?: string,
    ): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await guardCallupVersion(client, leagueId, callupId, expectedVersion);

        let stadiumName: string | null = null;
        let stadiumMapUrl: string | null = null;
        if (input.stadiumId) {
          const stadium = await client.query<{ name: string; google_maps_url: string | null }>(
            "SELECT name, google_maps_url FROM public.stadiums WHERE id = $1::uuid AND league_id = $2::uuid",
            [input.stadiumId, leagueId],
          );
          if (stadium.rows[0]) {
            stadiumName = stadium.rows[0].name;
            stadiumMapUrl = stadium.rows[0].google_maps_url;
          } else {
            throw new CallupPersistenceError("Estádio fora da pelada selecionada.", 400);
          }
        }
        if (!stadiumName) {
          const league = await client.query<{ stadium_name: string | null; stadium_map_url: string | null }>(
            "SELECT stadium_name, stadium_map_url FROM public.leagues WHERE id = $1::uuid",
            [leagueId],
          );
          if (league.rows[0]) {
            stadiumName = league.rows[0].stadium_name;
            stadiumMapUrl = league.rows[0].stadium_map_url;
          }
        }

        const updateResult = await client.query(
          `UPDATE public.callups
           SET date = $3::date,
               start_time = $4::time,
               stadium_id = $5::uuid,
               stadium_name = $6::text,
               stadium_map_url = $7::text,
               round_type = $8::text,
               updated_at = clock_timestamp()
           WHERE id = $2::uuid AND league_id = $1::uuid`,
          [
            leagueId,
            callupId,
            input.date,
            input.startTime,
            input.stadiumId,
            stadiumName,
            stadiumMapUrl,
            input.roundType,
          ],
        );

        if ((updateResult.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
        }

        // Sincroniza rodada rascunho vinculada
        await client.query(
          `UPDATE public.rounds
           SET date = $3::date,
               start_time = $4::time,
               stadium_id = $5::uuid,
               stadium_name = $6::text,
               stadium_map_url = $7::text,
               round_type = $8::text
           WHERE id = (SELECT round_id FROM public.callups WHERE id = $2::uuid)
             AND league_id = $1::uuid
             AND status = 'draft'`,
          [
            leagueId,
            callupId,
            input.date,
            input.startTime,
            input.stadiumId,
            stadiumName,
            stadiumMapUrl,
            input.roundType,
          ],
        );
      });
    },

    async closeCallup(leagueId: string, callupId: string, actor: Actor, expectedVersion?: string): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await guardCallupVersion(client, leagueId, callupId, expectedVersion);
        const result = await client.query(
          "UPDATE public.callups SET status = 'closed', updated_at = clock_timestamp() WHERE id = $2::uuid AND league_id = $1::uuid",
          [leagueId, callupId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async setVisibility(leagueId: string, callupId: string, isPublic: boolean, actor: Actor, expectedVersion?: string): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await guardCallupVersion(client, leagueId, callupId, expectedVersion);
        const result = await client.query(
          "UPDATE public.callups SET is_public = $3::boolean, updated_at = clock_timestamp() WHERE id = $2::uuid AND league_id = $1::uuid",
          [leagueId, callupId, isPublic],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async setMatchRules(leagueId: string, callupId: string, matchDuration: number, goalsToFinish: number, actor: Actor, expectedVersion?: string): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await guardCallupVersion(client, leagueId, callupId, expectedVersion);
        const check = await client.query<{ id: string }>(
          "SELECT id FROM public.callups WHERE id = $2::uuid AND league_id = $1::uuid",
          [leagueId, callupId],
        );
        if ((check.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
        }
        await client.query(
          "SELECT public.update_callup_match_rules($1::uuid, $2::integer, $3::integer)",
          [callupId, matchDuration, goalsToFinish],
        );
      });
    },

    async lockCallup(leagueId: string, callupId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const roster = await client.query<{ capacity: number; confirmed_count: number }>(
          `SELECT c.capacity,
                  COUNT(ce.id) FILTER (WHERE ce.status = 'confirmed')::int AS confirmed_count
           FROM public.callups c
           LEFT JOIN public.callup_entries ce ON ce.callup_id = c.id
           WHERE c.id = $2::uuid AND c.league_id = $1::uuid
           GROUP BY c.id`,
          [leagueId, callupId],
        );
        const callup = roster.rows[0];
        if (!callup) throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        if (Number(callup.confirmed_count) < Number(callup.capacity)) {
          throw new CallupPersistenceError(
            `A lista precisa ter ${callup.capacity} confirmados para montar a rodada.`,
            409,
          );
        }
        const result = await client.query(
          "UPDATE public.callups SET status = 'locked', updated_at = NOW() WHERE id = $2::uuid AND league_id = $1::uuid AND status = 'open'",
          [leagueId, callupId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação já está fechada ou não encontrada.", 400);
        }
      });
    },

    async joinCallup(
      leagueId: string,
      callupId: string,
      actor: Actor,
    ): Promise<{ status: CallupEntryStatus; position: number }> {
      return authenticated(pool, actor, async (client) => {
        const verifyCallup = await client.query<{ id: string }>(
          "SELECT id FROM public.callups WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
        if (!verifyCallup.rows[0]) {
          throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        }

        await client.query("SELECT public.ensure_my_player_account()");

        const result = await client.query<{
          join_callup: { status?: "confirmed" | "waitlist" | "waitlisted"; position?: number } | string;
        }>(
          "SELECT row_to_json(public.join_callup($1::uuid)) AS join_callup",
          [callupId],
        );

        const data = result.rows[0]?.join_callup;
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        const rawStatus = parsed?.status;
        const status: CallupEntryStatus = rawStatus === "waitlist" || rawStatus === "waitlisted"
          ? "waitlisted"
          : "confirmed";
        const position = Number(parsed?.position || 1);
        return { status, position };
      });
    },

    async leaveCallup(
      leagueId: string,
      callupId: string,
      actor: Actor,
    ): Promise<{ roundId?: string | null }> {
      return authenticated(pool, actor, async (client) => {
        const callup = await client.query<{ round_id: string | null }>(
          "SELECT round_id FROM public.callups WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
        if (!callup.rows[0]) {
          throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        }

        await client.query("SELECT public.leave_callup($1::uuid)", [callupId]);
        return { roundId: callup.rows[0].round_id };
      });
    },

    async addPlayer(
      leagueId: string,
      callupId: string,
      playerId: string,
      asAdmin: boolean,
      actor: Actor,
    ): Promise<{ status: CallupEntryStatus; position: number }> {
      return authenticated(pool, actor, async (client) => {
        const verifyCallup = await client.query<{ id: string }>(
          "SELECT id FROM public.callups WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
        if (!verifyCallup.rows[0]) {
          throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        }

        if (asAdmin) {
          await requireLeagueAdmin(client, leagueId);
          const result = await client.query<{
            admin_add_callup_player: { status?: "confirmed" | "waitlist" | "waitlisted"; position?: number } | string;
          }>(
            "SELECT row_to_json(public.admin_add_callup_player($1::uuid, $2::uuid)) AS admin_add_callup_player",
            [callupId, playerId],
          );
          const data = result.rows[0]?.admin_add_callup_player;
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          const status: CallupEntryStatus = parsed?.status === "waitlist" || parsed?.status === "waitlisted"
            ? "waitlisted"
            : "confirmed";
          return { status, position: Number(parsed?.position || 1) };
        } else {
          await client.query(
            "SELECT public.add_player_to_callup($1::uuid, $2::uuid, false)",
            [callupId, playerId],
          );
          // Consulta entry gerada
          const entryResult = await client.query<{ status: string; position: number }>(
            "SELECT status, position FROM public.callup_entries WHERE callup_id = $1::uuid AND player_id = $2::uuid ORDER BY created_at DESC LIMIT 1",
            [callupId, playerId],
          );
          const rawStatus = entryResult.rows[0]?.status;
          const status: CallupEntryStatus = rawStatus === "waitlist" || rawStatus === "waitlisted"
            ? "waitlisted"
            : "confirmed";
          return { status, position: Number(entryResult.rows[0]?.position || 1) };
        }
      });
    },

    async addPlayers(leagueId, callupId, playerIds, actor) {
      return authenticated(pool, actor, async (client) => {
        const eligible = await client.query<{ allowed: boolean }>(
          `SELECT NOT EXISTS (
             SELECT 1
             FROM unnest($3::uuid[]) AS requested(player_id)
             WHERE NOT EXISTS (
               SELECT 1 FROM public.league_members member
               JOIN public.players player ON player.id = member.player_id
               WHERE member.league_id = league.id AND member.is_active
                 AND member.player_id = requested.player_id
                 AND (league.feature_tier <> 'quick' OR player.member_category = 'guest')
             )
           ) AND public.is_league_member(league.id) AS allowed
           FROM public.callups callup
           JOIN public.leagues league ON league.id = callup.league_id
           WHERE callup.id = $1::uuid AND league.id = $2::uuid`,
          [callupId, leagueId, playerIds],
        );
        if (!eligible.rows[0]) {
          throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        }
        if (!eligible.rows[0].allowed) {
          throw new CallupPersistenceError("Um ou mais jogadores não pertencem ao elenco desta pelada.", 403);
        }

        const failures: Array<{ playerId: string; error: string }> = [];
        for (const playerId of playerIds) {
          await client.query("SAVEPOINT add_callup_player");
          try {
            await client.query(
              "SELECT public.add_player_to_callup($1::uuid, $2::uuid, false)",
              [callupId, playerId],
            );
          } catch (error) {
            const code = (error as { code?: string }).code;
            if (code !== "P0001") throw error;
            await client.query("ROLLBACK TO SAVEPOINT add_callup_player");
            failures.push({ playerId, error: translateFailure(error).message });
          }
          await client.query("RELEASE SAVEPOINT add_callup_player");
        }
        return { added: playerIds.length - failures.length, failures };
      });
    },

    async removePlayer(
      leagueId: string,
      callupId: string,
      playerId: string,
      asAdmin: boolean,
      actor: Actor,
    ): Promise<{ revalidateRoundId?: string | null }> {
      return authenticated(pool, actor, async (client) => {
        const callup = await client.query<{ round_id: string | null }>(
          "SELECT round_id FROM public.callups WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
        if (!callup.rows[0]) {
          throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        }

        if (asAdmin) {
          await requireLeagueAdmin(client, leagueId);
          await client.query(
            "SELECT public.admin_remove_callup_player($1::uuid, $2::uuid)",
            [callupId, playerId],
          );
        } else {
          await client.query(
            "SELECT public.remove_my_added_callup_player($1::uuid, $2::uuid)",
            [callupId, playerId],
          );
        }

        return { revalidateRoundId: callup.rows[0].round_id };
      });
    },

    async inviteGuest(
      leagueId: string,
      callupId: string,
      guest: { name: string; playerProfile?: string; isGoalkeeper?: boolean },
      actor: Actor,
    ): Promise<CallupInviteResult> {
      return authenticated(pool, actor, async (client) => {
        const verifyCallup = await client.query<{ id: string }>(
          "SELECT id FROM public.callups WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
        if (!verifyCallup.rows[0]) {
          throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        }

        const result = await client.query<{
          player_id: string;
          status: string;
          position: number;
        }>(
          "SELECT * FROM public.create_callup_guest($1::uuid, $2::text, $3::text, $4::boolean)",
          [
            callupId,
            guest.name,
            guest.playerProfile || "midfield",
            Boolean(guest.isGoalkeeper),
          ],
        );

        const row = result.rows[0];
        if (!row) throw new CallupPersistenceError("Não foi possível convidar o amigo.", 500);

        const status: CallupEntryStatus = row.status === "waitlist" || row.status === "waitlisted"
          ? "waitlisted"
          : "confirmed";
        return {
          playerId: row.player_id,
          status,
          position: Number(row.position || 1),
        };
      });
    },

    async inviteGuestList(
      leagueId: string,
      callupId: string,
      guests: Array<{ name: string; isGoalkeeper?: boolean }>,
      playerProfile: string,
      actor: Actor,
    ): Promise<CallupGuestListResult> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);

        let created = 0;
        let confirmed = 0;
        let waitlisted = 0;
        const failed: Array<{ name: string; error: string }> = [];

        for (const guest of guests) {
          try {
            const res = await client.query<{
              player_id: string;
              status: string;
              position: number;
            }>(
              "SELECT * FROM public.create_callup_guest($1::uuid, $2::text, $3::text, $4::boolean)",
              [
                callupId,
                guest.name,
                playerProfile,
                Boolean(guest.isGoalkeeper),
              ],
            );
            const row = res.rows[0];
            if (row) {
              created += 1;
              if (row.status === "waitlist" || row.status === "waitlisted") {
                waitlisted += 1;
              } else {
                confirmed += 1;
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
            failed.push({ name: guest.name, error: errorMsg });
          }
        }

        return { created, confirmed, waitlisted, failed };
      });
    },

    async createPrelist(
      leagueId: string,
      callupId: string,
      actor: Actor,
    ): Promise<{ roundId: string; created: boolean }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);

        const callupRes = await client.query<{
          id: string;
          date: string | Date;
          start_time: string;
          stadium_id: string | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          round_type: string;
          status: string;
          round_id: string | null;
        }>(
          `SELECT id, date, start_time, stadium_id, stadium_name, stadium_map_url,
                  round_type, status, round_id
           FROM public.callups
           WHERE id = $1::uuid AND league_id = $2::uuid`,
          [callupId, leagueId],
        );
        const callup = callupRes.rows[0];
        if (!callup) throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);
        if (callup.round_id) {
          const linked = await client.query<{ id: string; status: string; preparation_stage: string | null }>(
            "SELECT id, status, preparation_stage FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid",
            [callup.round_id, leagueId],
          );
          const round = linked.rows[0];
          if (round?.status === "draft" && round.preparation_stage === "prelist") {
            return { roundId: round.id, created: false };
          }
          throw new CallupPersistenceError("Esta convocação já foi convertida em rodada.", 409);
        }
        if (callup.status !== "open") {
          throw new CallupPersistenceError("A convocação precisa estar aberta para criar a pré-lista.", 409);
        }

        const confirmedRes = await client.query<{ player_id: string }>(
          "SELECT player_id FROM public.callup_entries WHERE callup_id = $1::uuid AND status = 'confirmed' ORDER BY position ASC",
          [callupId],
        );
        const confirmedPlayerIds = confirmedRes.rows.map((r) => r.player_id);

        const dateStr = callup.date instanceof Date ? callup.date.toISOString().slice(0, 10) : String(callup.date).slice(0, 10);
        const result = await client.query<{ save_round_prelist: string }>(
          `SELECT public.save_round_prelist(
             $1::uuid, NULL::uuid, $2::date, $3::time, $4::text,
             $5::uuid[], $6::uuid, $7::uuid, $8::text, $9::text
           )`,
          [
            leagueId,
            dateStr,
            callup.start_time || "08:00",
            callup.round_type === "friendly" ? "friendly" : "official",
            confirmedPlayerIds,
            callup.id,
            callup.stadium_id,
            callup.stadium_name,
            callup.stadium_map_url,
          ],
        );

        const roundId = result.rows[0]?.save_round_prelist;
        if (!roundId) throw new CallupPersistenceError("Não foi possível gerar a pré-lista.", 500);
        return { roundId: String(roundId), created: true };
      });
    },

    async repairMyPlayer(actor: Actor): Promise<{ playerId?: string }> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{ ensure_my_player_account: { player_id?: string } | string }>(
          "SELECT public.ensure_my_player_account()",
        );
        const data = result.rows[0]?.ensure_my_player_account;
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        return { playerId: parsed?.player_id };
      });
    },
  };
}
