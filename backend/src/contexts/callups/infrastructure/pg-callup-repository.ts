import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
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
  CallupPlayer,
  CallupRoundTeam,
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
    throw translateFailure(cause);
  }
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
        }>(
          `SELECT c.id, c.league_id, c.date, c.start_time, c.stadium_id, c.round_type,
                  c.status, c.is_public, c.players_per_team, c.teams_per_round,
                  c.capacity, c.round_id, c.created_at, c.updated_at
           FROM public.callups c
           ${whereClause}
           ORDER BY c.date ASC, c.start_time ASC, c.created_at ASC`,
          params,
        );

        if (!callupsResult.rows.length) return [];

        const callupIds = callupsResult.rows.map((r) => r.id);
        const roundIds = callupsResult.rows.map((r) => r.round_id).filter((id): id is string => Boolean(id));

        // Busca partidas e times de rodadas vinculadas
        const roundDataMap = new Map<
          string,
          {
            id: string;
            status: string;
            matches: Array<{ id: string; status: string; started_at: string | null }>;
            teams: CallupRoundTeam[];
          }
        >();

        if (roundIds.length > 0) {
          const roundsResult = await client.query<{
            id: string;
            status: string;
          }>(
            "SELECT id, status FROM public.rounds WHERE id = ANY($1::uuid[])",
            [roundIds],
          );
          for (const round of roundsResult.rows) {
            roundDataMap.set(round.id, {
              id: round.id,
              status: round.status,
              matches: [],
              teams: [],
            });
          }

          const matchesResult = await client.query<{
            id: string;
            round_id: string;
            status: string;
            started_at: string | Date | null;
          }>(
            "SELECT id, round_id, status, started_at FROM public.matches WHERE round_id = ANY($1::uuid[])",
            [roundIds],
          );
          for (const m of matchesResult.rows) {
            const r = roundDataMap.get(m.round_id);
            if (r) {
              r.matches.push({
                id: m.id,
                status: m.status,
                started_at: m.started_at instanceof Date ? m.started_at.toISOString() : m.started_at ? String(m.started_at) : null,
              });
            }
          }

          const teamsResult = await client.query<{
            id: string;
            round_id: string;
            name: string;
            position: number | null;
            color: string;
            crest_url: string | null;
          }>(
            "SELECT id, round_id, name, position, color, crest_url FROM public.teams WHERE round_id = ANY($1::uuid[])",
            [roundIds],
          );
          const teamIds = teamsResult.rows.map((t) => t.id);

          const teamPlayersMap = new Map<string, Array<{ player_id: string }>>();
          if (teamIds.length > 0) {
            const teamPlayersResult = await client.query<{
              team_id: string;
              player_id: string;
            }>(
              "SELECT team_id, player_id FROM public.team_players WHERE team_id = ANY($1::uuid[])",
              [teamIds],
            );
            for (const tp of teamPlayersResult.rows) {
              const list = teamPlayersMap.get(tp.team_id) || [];
              list.push({ player_id: tp.player_id });
              teamPlayersMap.set(tp.team_id, list);
            }
          }

          for (const t of teamsResult.rows) {
            const r = roundDataMap.get(t.round_id);
            if (r) {
              r.teams.push({
                id: t.id,
                name: t.name,
                position: t.position,
                color: t.color,
                crest_url: t.crest_url,
                team_players: teamPlayersMap.get(t.id) || [],
              });
            }
          }
        }

        // Busca entries e jogadores
        const entriesResult = await client.query<{
          id: string;
          callup_id: string;
          player_id: string;
          status: string;
          position: number;
          created_at: string | Date;
          p_id: string;
          p_name: string;
          p_nickname: string | null;
          p_avatar_url: string | null;
          p_player_profile: string;
          p_is_goalkeeper: boolean;
          p_member_category: string;
        }>(
          `SELECT ce.id, ce.callup_id, ce.player_id, ce.status, ce.position, ce.created_at,
                  p.id AS p_id, p.name AS p_name, p.nickname AS p_nickname,
                  p.avatar_url AS p_avatar_url, p.player_profile AS p_player_profile,
                  p.is_goalkeeper AS p_is_goalkeeper, p.member_category AS p_member_category
           FROM public.callup_entries ce
           JOIN public.players p ON p.id = ce.player_id
           WHERE ce.callup_id = ANY($1::uuid[])
           ORDER BY ce.position ASC`,
          [callupIds],
        );

        const joinersResult = await client.query<{
          callup_entry_id: string;
          joined_by_name: string | null;
        }>(
          "SELECT callup_entry_id, joined_by_name FROM public.get_callup_entry_joiners($1::uuid[])",
          [callupIds],
        );
        const joinerNameByEntryId = new Map(
          joinersResult.rows.map((j) => [j.callup_entry_id, j.joined_by_name]),
        );

        const entriesByCallupId = new Map<string, CallupEntry[]>();
        for (const row of entriesResult.rows) {
          const player: CallupPlayer = {
            id: row.p_id,
            name: row.p_name,
            nickname: row.p_nickname,
            avatar_url: row.p_avatar_url,
            player_profile: row.p_player_profile,
            is_goalkeeper: Boolean(row.p_is_goalkeeper),
            member_category: row.p_member_category,
          };
          const status: CallupEntryStatus = row.status === "waitlisted" || row.status === "waitlist"
            ? "waitlisted"
            : "confirmed";
          const entry: CallupEntry = {
            id: row.id,
            callup_id: row.callup_id,
            player_id: row.player_id,
            status,
            position: Number(row.position),
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
            joined_by_name: joinerNameByEntryId.get(row.id) ?? null,
            player,
          };
          const list = entriesByCallupId.get(row.callup_id) || [];
          list.push(entry);
          entriesByCallupId.set(row.callup_id, list);
        }

        const callups: Callup[] = [];
        for (const c of callupsResult.rows) {
          const linkedRound = c.round_id ? roundDataMap.get(c.round_id) || null : null;
          if (linkedRound) {
            const hasStarted = (linkedRound.matches || []).some(
              (m) => m.started_at !== null || m.status === "in_progress" || m.status === "completed",
            );
            if (hasStarted) continue;
          }

          const rawEntries = entriesByCallupId.get(c.id) || [];
          const sortedEntries = rawEntries.sort((a, b) => {
            if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
            return a.position - b.position;
          });

          const dateStr = c.date instanceof Date ? c.date.toISOString().slice(0, 10) : String(c.date).slice(0, 10);
          callups.push({
            id: c.id,
            league_id: c.league_id,
            date: dateStr,
            start_time: String(c.start_time).slice(0, 5),
            stadium_id: c.stadium_id,
            round_type: c.round_type,
            status: c.status,
            is_public: Boolean(c.is_public),
            players_per_team: Number(c.players_per_team),
            teams_per_round: Number(c.teams_per_round),
            capacity: Number(c.capacity),
            round_id: c.round_id,
            created_at: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
            updated_at: c.updated_at instanceof Date ? c.updated_at.toISOString() : c.updated_at ? String(c.updated_at) : undefined,
            entries: sortedEntries,
            round: linkedRound,
          });
        }

        return callups;
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
    ): Promise<void> {
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
               updated_at = NOW()
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
               round_type = $8::text,
               updated_at = NOW()
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

    async closeCallup(leagueId: string, callupId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query(
          "UPDATE public.callups SET status = 'closed', updated_at = NOW() WHERE id = $2::uuid AND league_id = $1::uuid",
          [leagueId, callupId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async setVisibility(leagueId: string, callupId: string, isPublic: boolean, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query(
          "UPDATE public.callups SET is_public = $3::boolean, updated_at = NOW() WHERE id = $2::uuid AND league_id = $1::uuid",
          [leagueId, callupId, isPublic],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new CallupPersistenceError("Convocação não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async lockCallup(leagueId: string, callupId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
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
          "SELECT public.join_callup($1::uuid)",
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
            "SELECT public.admin_add_callup_player($1::uuid, $2::uuid)",
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
    ): Promise<{ roundId: string }> {
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
        }>(
          "SELECT id, date, start_time, stadium_id, stadium_name, stadium_map_url, round_type FROM public.callups WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
        const callup = callupRes.rows[0];
        if (!callup) throw new CallupPersistenceError("Convocação fora da pelada selecionada.", 404);

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
        return { roundId: String(roundId) };
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
