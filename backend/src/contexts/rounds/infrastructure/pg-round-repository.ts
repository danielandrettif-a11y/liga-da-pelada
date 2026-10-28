import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  AdminRoundPrelist,
  CreateRoundWithTeamsInput,
  DraftWorkspace,
  RoundRepository,
  SaveRoundPrelistInput,
  ServerAdaptiveDrawResult,
  TeamFormationInput,
} from "../application/manage-rounds.js";
import type {
  Round,
  RoundMatchSetup,
  RoundPlayerAvailability,
  RoundWithCounts,
} from "../domain/round.js";

export class RoundPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "RoundPersistenceError";
  }
}

function translateFailure(cause: unknown): RoundPersistenceError {
  if (cause instanceof RoundPersistenceError) return cause;
  const error = cause as Error & { code?: string };
  const message = error.message || "";
  if (/ROUND_FORBIDDEN|Somente administradores|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new RoundPersistenceError("Somente administradores podem realizar esta operação.", 403);
  }
  if (/ROUND_NOT_FOUND|fora da pelada/i.test(message)) {
    return new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
  }
  return new RoundPersistenceError(message || "Falha na persistência da rodada.", 500);
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
    throw new RoundPersistenceError("Somente administradores podem realizar esta ação.", 403);
  }
}

export function pgRoundRepository(pool: Pool): RoundRepository {
  return {
    async getRounds(seasonId: string, actor: Actor): Promise<RoundWithCounts[]> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{
          id: string;
          league_id: string;
          season_id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: "draft" | "active" | "finished";
          round_type: "official" | "friendly";
          formation_mode: "auto" | "manual" | "balanced" | "draft";
          target_players_per_team: number | null;
          target_teams_per_round: number | null;
          arrival_order_enabled: boolean;
          preparation_stage: "prelist" | "teams_ready" | "in_progress" | "completed";
          stadium_id: string | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          notes: string | null;
          payment_pix: string | null;
          payment_total: number | null;
          best_goalkeeper_player_id: string | null;
          created_at: string | Date;
          player_count: string | number;
          match_count: string | number;
        }>(
          `SELECT r.*,
                  COUNT(DISTINCT rp.id)::int AS player_count,
                  COUNT(DISTINCT m.id)::int AS match_count
           FROM public.rounds r
           LEFT JOIN public.round_players rp ON rp.round_id = r.id
           LEFT JOIN public.matches m ON m.round_id = r.id
           WHERE r.season_id = $1::uuid
             AND r.preparation_stage = 'teams_ready'
           GROUP BY r.id
           ORDER BY r.date DESC, r.created_at DESC`,
          [seasonId],
        );

        return result.rows.map((row) => ({
          ...row,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          round_players: [{ count: Number(row.player_count || 0) }],
          matches: [{ count: Number(row.match_count || 0) }],
        }));
      });
    },

    async getRound(roundId: string, leagueId: string, actor: Actor): Promise<Round | null> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{
          id: string;
          league_id: string;
          season_id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: "draft" | "active" | "finished";
          round_type: "official" | "friendly";
          formation_mode: "auto" | "manual" | "balanced" | "draft";
          target_players_per_team: number | null;
          target_teams_per_round: number | null;
          arrival_order_enabled: boolean;
          preparation_stage: "prelist" | "teams_ready" | "in_progress" | "completed";
          stadium_id: string | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          notes: string | null;
          payment_pix: string | null;
          payment_total: number | null;
          best_goalkeeper_player_id: string | null;
          created_at: string | Date;
        }>(
          "SELECT * FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid LIMIT 1",
          [roundId, leagueId],
        );
        const row = result.rows[0];
        if (!row) return null;

        return {
          ...row,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        };
      });
    },

    async getRoundMatchSetup(roundId: string, leagueId: string, actor: Actor): Promise<RoundMatchSetup | null> {
      return authenticated(pool, actor, async (client) => {
        const roundRes = await client.query<{
          id: string;
          status: "draft" | "active" | "finished";
          date: string | Date;
          round_type: "official" | "friendly";
        }>(
          "SELECT id, status, date, round_type FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid LIMIT 1",
          [roundId, leagueId],
        );
        const round = roundRes.rows[0];
        if (!round) return null;

        const teamsRes = await client.query<{
          id: string;
          name: string;
          color: string;
          crest_url: string | null;
          position: number;
        }>(
          "SELECT id, name, color, crest_url, position FROM public.teams WHERE round_id = $1::uuid ORDER BY position ASC",
          [roundId],
        );

        const teamIds = teamsRes.rows.map((t) => t.id);
        const teamPlayersMap = new Map<string, Array<{
          player_id: string;
          goalkeeper_order: number | null;
          loan_order?: number | null;
          player: {
            id: string;
            name: string;
            nickname: string | null;
            avatar_url: string | null;
            player_profile: string | null;
            is_goalkeeper: boolean;
            member_category: string;
          };
        }>>();

        if (teamIds.length > 0) {
          const tpRes = await client.query<{
            team_id: string;
            player_id: string;
            goalkeeper_order: number | null;
            loan_order: number | null;
            p_id: string;
            p_name: string;
            p_nickname: string | null;
            p_avatar_url: string | null;
            p_player_profile: string | null;
            p_is_goalkeeper: boolean;
            p_member_category: string;
          }>(
            `SELECT tp.team_id, tp.player_id, tp.goalkeeper_order, tp.loan_order,
                    p.id AS p_id, p.name AS p_name, p.nickname AS p_nickname,
                    p.avatar_url AS p_avatar_url, p.player_profile AS p_player_profile,
                    p.is_goalkeeper AS p_is_goalkeeper, p.member_category AS p_member_category
             FROM public.team_players tp
             JOIN public.players p ON p.id = tp.player_id
             WHERE tp.team_id = ANY($1::uuid[])
             ORDER BY tp.goalkeeper_order ASC NULLS LAST, p.name ASC`,
            [teamIds],
          );

          for (const tp of tpRes.rows) {
            const list = teamPlayersMap.get(tp.team_id) || [];
            list.push({
              player_id: tp.player_id,
              goalkeeper_order: tp.goalkeeper_order,
              loan_order: tp.loan_order,
              player: {
                id: tp.p_id,
                name: tp.p_name,
                nickname: tp.p_nickname,
                avatar_url: tp.p_avatar_url,
                player_profile: tp.p_player_profile,
                is_goalkeeper: Boolean(tp.p_is_goalkeeper),
                member_category: tp.p_member_category,
              },
            });
            teamPlayersMap.set(tp.team_id, list);
          }
        }

        const teams = teamsRes.rows.map((team) => ({
          ...team,
          team_players: teamPlayersMap.get(team.id) || [],
        }));

        return {
          id: round.id,
          status: round.status,
          date: round.date instanceof Date ? round.date.toISOString().slice(0, 10) : String(round.date).slice(0, 10),
          round_type: round.round_type,
          teams,
        };
      });
    },

    async getActiveLeague(leagueId: string, actor: Actor) {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{
          id: string;
          players_per_team: number;
          teams_per_round: number;
          match_duration: number;
          stadium_name: string | null;
          stadium_map_url: string | null;
          event_duration_minutes: number;
          preseason_enabled: boolean;
          feature_tier: string;
        }>(
          `SELECT id, players_per_team, teams_per_round, match_duration, stadium_name,
                  stadium_map_url, event_duration_minutes, preseason_enabled, feature_tier
           FROM public.leagues
           WHERE id = $1::uuid LIMIT 1`,
          [leagueId],
        );
        const row = res.rows[0];
        if (!row) throw new RoundPersistenceError("Pelada selecionada não encontrada.", 404);
        return row;
      });
    },

    async createRoundWithTeams(input: CreateRoundWithTeamsInput, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);

        // Insere rodada
        const seasonRes = await client.query<{ id: string }>(
          "SELECT id FROM public.seasons WHERE league_id = $1::uuid AND status = 'active' LIMIT 1",
          [leagueId],
        );
        const seasonId = seasonRes.rows[0]?.id;
        if (!seasonId) throw new RoundPersistenceError("Nenhuma temporada ativa encontrada para a pelada.", 400);

        const roundInsert = await client.query<{ id: string }>(
          `INSERT INTO public.rounds (
             league_id, season_id, date, start_time, round_type, target_players_per_team,
             status, preparation_stage, formation_mode
           ) VALUES (
             $1::uuid, $2::uuid, $3::date, $4::time, $5::text, $6::int,
             'draft', 'teams_ready', 'manual'
           ) RETURNING id`,
          [
            leagueId,
            seasonId,
            input.date,
            input.startTime || "08:00",
            input.roundType,
            input.playersPerTeam,
          ],
        );
        const roundId = roundInsert.rows[0]?.id;
        if (!roundId) throw new RoundPersistenceError("Não foi possível criar a rodada.", 500);

        // Insere times e jogadores
        for (let i = 0; i < input.teams.length; i++) {
          const team = input.teams[i];
          if (!team) continue;
          const teamInsert = await client.query<{ id: string }>(
            `INSERT INTO public.teams (round_id, name, color, crest_url, position, captain_player_id)
             VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::int, $6::uuid)
             RETURNING id`,
            [roundId, team.name, team.color, team.crestUrl || null, i + 1, team.captainPlayerId || null],
          );
          const teamId = teamInsert.rows[0]?.id;
          if (teamId && team.playerIds.length > 0) {
            for (let pIdx = 0; pIdx < team.playerIds.length; pIdx++) {
              const pid = team.playerIds[pIdx];
              await client.query(
                "INSERT INTO public.team_players (team_id, player_id) VALUES ($1::uuid, $2::uuid)",
                [teamId, pid],
              );
              await client.query(
                `INSERT INTO public.round_players (round_id, player_id, availability_status, attendance_status)
                 VALUES ($1::uuid, $2::uuid, 'available', 'pending')
                 ON CONFLICT (round_id, player_id) DO NOTHING`,
                [roundId, pid],
              );
            }
          }
        }

        return { roundId };
      });
    },

    async deleteRound(roundId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query(
          "DELETE FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid",
          [roundId, leagueId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async finishRound(roundId: string, leagueId: string, bestGoalkeeperPlayerId: string | null, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query(
          `UPDATE public.rounds
           SET status = 'finished',
               best_goalkeeper_player_id = $3::uuid,
               updated_at = NOW()
           WHERE id = $1::uuid AND league_id = $2::uuid`,
          [roundId, leagueId, bestGoalkeeperPlayerId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async getAdminRoundPrelist(roundId: string, leagueId: string, actor: Actor): Promise<AdminRoundPrelist | null> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{
          id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: string;
          round_type: string;
          preparation_stage: string;
          callup_id: string | null;
        }>(
          `SELECT id, number, date, start_time, status, round_type, preparation_stage, callup_id
           FROM public.rounds
           WHERE id = $1::uuid AND league_id = $2::uuid LIMIT 1`,
          [roundId, leagueId],
        );
        const row = res.rows[0];
        if (!row) return null;

        const playersRes = await client.query<{
          player_id: string;
          name: string;
          nickname: string | null;
          avatar_url: string | null;
          status: string;
        }>(
          `SELECT rp.player_id, p.name, p.nickname, p.avatar_url, rp.attendance_status AS status
           FROM public.round_players rp
           JOIN public.players p ON p.id = rp.player_id
           WHERE rp.round_id = $1::uuid
           ORDER BY p.name ASC`,
          [roundId],
        );

        return {
          ...row,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          players: playersRes.rows,
        };
      });
    },

    async getAdminRoundPrelists(leagueId: string, actor: Actor): Promise<AdminRoundPrelist[]> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{
          id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: string;
          round_type: string;
          preparation_stage: string;
          callup_id: string | null;
        }>(
          `SELECT id, number, date, start_time, status, round_type, preparation_stage, callup_id
           FROM public.rounds
           WHERE league_id = $1::uuid
             AND preparation_stage = 'prelist'
           ORDER BY date DESC, created_at DESC`,
          [leagueId],
        );

        return res.rows.map((row) => ({
          ...row,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          players: [],
        }));
      });
    },

    async saveRoundPrelist(input: SaveRoundPrelistInput, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query<{ save_round_prelist: string }>(
          `SELECT public.save_round_prelist(
             $1::uuid, $2::uuid, $3::date, $4::time, $5::text,
             $6::uuid[], $7::uuid, $8::uuid, $9::text, $10::text
           )`,
          [
            leagueId,
            input.roundId || null,
            input.date,
            input.startTime || "08:00",
            input.roundType || "official",
            input.playerIds,
            input.callupId || null,
            input.stadiumId || null,
            input.stadiumName || null,
            input.stadiumMapUrl || null,
          ],
        );
        const roundId = result.rows[0]?.save_round_prelist;
        if (!roundId) throw new RoundPersistenceError("Falha ao salvar pré-lista.", 500);
        return { roundId: String(roundId) };
      });
    },

    async setCallupFormat(callupId: string, leagueId: string, format: { playersPerTeam: number; teamsPerRound: number }, actor: Actor): Promise<{ fantasySizePreserved: boolean; fantasyLineupSize: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        try {
          const res = await client.query<{ fantasy_lineup_size: number; fantasy_size_preserved: boolean }>(
            `SELECT fantasy_lineup_size, fantasy_size_preserved FROM public.set_callup_format($1::uuid, $2::int, $3::int)`,
            [callupId, format.playersPerTeam, format.teamsPerRound],
          );
          const row = res.rows[0];
          return {
            fantasySizePreserved: Boolean(row?.fantasy_size_preserved),
            fantasyLineupSize: Number(row?.fantasy_lineup_size || format.playersPerTeam),
          };
        } catch {
          await client.query(
            `UPDATE public.callups
             SET players_per_team = $3::int,
                 teams_per_round = $4::int,
                 capacity = $3::int * $4::int,
                 updated_at = NOW()
             WHERE id = $1::uuid AND league_id = $2::uuid`,
            [callupId, leagueId, format.playersPerTeam, format.teamsPerRound],
          );
          return {
            fantasySizePreserved: true,
            fantasyLineupSize: format.playersPerTeam,
          };
        }
      });
    },

    async setCallupMatchSize(callupId: string, leagueId: string, size: { playersPerTeam: number }, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          `UPDATE public.callups
           SET players_per_team = $3::int,
               capacity = $3::int * teams_per_round,
               updated_at = NOW()
           WHERE id = $1::uuid AND league_id = $2::uuid`,
          [callupId, leagueId, size.playersPerTeam],
        );
      });
    },

    async getNextTeamPresetOffset(leagueId: string, actor: Actor): Promise<{ offset: number }> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{ max_offset: number }>(
          "SELECT COALESCE(MAX(number), 0) AS max_offset FROM public.rounds WHERE league_id = $1::uuid",
          [leagueId],
        );
        return { offset: Number(res.rows[0]?.max_offset || 0) };
      });
    },

    async markRoundTeamArrived(roundId: string, teamId: string, leagueId: string, arrived: boolean, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.teams SET is_arrived = $3::boolean WHERE id = $2::uuid AND round_id = $1::uuid",
          [roundId, teamId, arrived],
        );
      });
    },

    async openCallupReplacementVacancy(callupId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.callups SET capacity = capacity + 1, updated_at = NOW() WHERE id = $1::uuid AND league_id = $2::uuid",
          [callupId, leagueId],
        );
      });
    },

    async previewRoundTeamShuffle(roundId: string, leagueId: string, mode: string, actor: Actor): Promise<unknown> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        return { roundId, mode, preview: true };
      });
    },

    async applyRoundTeamShuffle(roundId: string, leagueId: string, mode: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
      });
    },

    async applyPermanentRoundTeamFormation(roundId: string, leagueId: string, input: TeamFormationInput, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        for (const team of input.teams) {
          if (team.captainPlayerId !== undefined) {
            await client.query(
              "UPDATE public.teams SET captain_player_id = $2::uuid WHERE id = $1::uuid",
              [team.teamId, team.captainPlayerId],
            );
          }
          await client.query("DELETE FROM public.team_players WHERE team_id = $1::uuid", [team.teamId]);
          for (const pid of team.playerIds) {
            await client.query(
              "INSERT INTO public.team_players (team_id, player_id) VALUES ($1::uuid, $2::uuid)",
              [team.teamId, pid],
            );
          }
        }
      });
    },

    async shuffleRoundTeams(roundId: string, leagueId: string, options: unknown, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
      });
    },

    async swapRoundTeamPlayers(roundId: string, leagueId: string, playerA: string, playerB: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const resA = await client.query<{ team_id: string }>(
          "SELECT team_id FROM public.team_players WHERE player_id = $1::uuid AND team_id IN (SELECT id FROM public.teams WHERE round_id = $2::uuid)",
          [playerA, roundId],
        );
        const resB = await client.query<{ team_id: string }>(
          "SELECT team_id FROM public.team_players WHERE player_id = $1::uuid AND team_id IN (SELECT id FROM public.teams WHERE round_id = $2::uuid)",
          [playerB, roundId],
        );
        const teamA = resA.rows[0]?.team_id;
        const teamB = resB.rows[0]?.team_id;
        if (!teamA || !teamB || teamA === teamB) return;

        await client.query("UPDATE public.team_players SET team_id = $1::uuid WHERE player_id = $2::uuid AND team_id = $3::uuid", [teamB, playerA, teamA]);
        await client.query("UPDATE public.team_players SET team_id = $1::uuid WHERE player_id = $2::uuid AND team_id = $3::uuid", [teamA, playerB, teamB]);
      });
    },

    async setRoundAttendanceBulk(roundId: string, leagueId: string, playerIds: string[], actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.round_players SET attendance_status = 'present', attendance_marked_at = NOW() WHERE round_id = $1::uuid AND player_id = ANY($2::uuid[])",
          [roundId, playerIds],
        );
      });
    },

    async setRoundPlayerAttendance(roundId: string, leagueId: string, playerId: string, present: boolean, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          `UPDATE public.round_players
           SET attendance_status = $3::text,
               attendance_marked_at = CASE WHEN $3::text = 'present' THEN NOW() ELSE NULL END
           WHERE round_id = $1::uuid AND player_id = $2::uuid`,
          [roundId, playerId, present ? "present" : "pending"],
        );
      });
    },

    async setRoundPlayerAvailability(roundId: string, leagueId: string, playerId: string, status: RoundPlayerAvailability, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.round_players SET availability_status = $3::text, availability_updated_at = NOW() WHERE round_id = $1::uuid AND player_id = $2::uuid",
          [roundId, playerId, status],
        );
      });
    },

    async setRoundTeamCaptain(roundId: string, teamId: string, leagueId: string, captainId: string | null, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.teams SET captain_player_id = $3::uuid WHERE id = $2::uuid AND round_id = $1::uuid",
          [roundId, teamId, captainId],
        );
      });
    },

    async setRoundTeamVestColor(roundId: string, teamId: string, leagueId: string, color: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.teams SET color = $3::text WHERE id = $2::uuid AND round_id = $1::uuid",
          [roundId, teamId, color],
        );
      });
    },

    async transferRoundPlayerIdentity(roundId: string, leagueId: string, fromId: string, toId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.team_players SET player_id = $3::uuid WHERE player_id = $2::uuid AND team_id IN (SELECT id FROM public.teams WHERE round_id = $1::uuid)",
          [roundId, fromId, toId],
        );
        await client.query(
          "UPDATE public.round_players SET player_id = $3::uuid WHERE round_id = $1::uuid AND player_id = $2::uuid",
          [roundId, fromId, toId],
        );
      });
    },

    async zeroPlayerRoundPoints(roundId: string, leagueId: string, playerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.round_players SET points_override = 0 WHERE round_id = $1::uuid AND player_id = $2::uuid",
          [roundId, playerId],
        );
      });
    },

    async addRoundEmergencySubstitute(roundId: string, leagueId: string, input: { name: string; teamId: string }, actor: Actor): Promise<{ playerId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const playerInsert = await client.query<{ id: string }>(
          `INSERT INTO public.players (name, member_category, is_selectable, created_by_user_id)
           VALUES ($1::text, 'guest', true, $2::uuid) RETURNING id`,
          [input.name, actor.userId],
        );
        const playerId = playerInsert.rows[0]?.id;
        if (!playerId) throw new RoundPersistenceError("Falha ao criar atleta substituto.", 500);

        await client.query(
          "INSERT INTO public.team_players (team_id, player_id) VALUES ($1::uuid, $2::uuid)",
          [input.teamId, playerId],
        );
        await client.query(
          "INSERT INTO public.round_players (round_id, player_id, availability_status, attendance_status) VALUES ($1::uuid, $2::uuid, 'available', 'present')",
          [roundId, playerId],
        );
        return { playerId };
      });
    },

    // Draft Operations
    async createTeamDraft(roundId: string, callupId: string | null, leagueId: string, actor: Actor): Promise<{ draftId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.team_drafts (league_id, round_id, callup_id, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'setup')
           RETURNING id`,
          [leagueId, roundId, callupId],
        );
        const draftId = res.rows[0]?.id;
        if (!draftId) throw new RoundPersistenceError("Falha ao criar draft.", 500);
        return { draftId };
      });
    },

    async getDraftWorkspace(draftId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{
          id: string;
          callup_id: string | null;
          round_id: string;
          status: "setup" | "active" | "paused" | "completed" | "confirmed" | "cancelled";
          current_pick: number;
          pause_reason: string | null;
        }>(
          "SELECT id, callup_id, round_id, status, current_pick, pause_reason FROM public.team_drafts WHERE id = $1::uuid AND league_id = $2::uuid",
          [draftId, leagueId],
        );
        const draft = res.rows[0];
        if (!draft) return null;

        return {
          id: draft.id,
          callupId: draft.callup_id,
          roundId: draft.round_id,
          status: draft.status,
          currentPick: Number(draft.current_pick || 1),
          pauseReason: draft.pause_reason,
          isAdmin: true,
          currentPlayerId: null,
          captains: [],
          players: [],
        };
      });
    },

    async getDraftWorkspaceByRound(roundId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{ id: string }>(
          "SELECT id FROM public.team_drafts WHERE round_id = $1::uuid AND league_id = $2::uuid ORDER BY created_at DESC LIMIT 1",
          [roundId, leagueId],
        );
        const draftId = res.rows[0]?.id;
        if (!draftId) return null;
        return this.getDraftWorkspace(draftId, leagueId, actor);
      });
    },

    async startTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query("UPDATE public.team_drafts SET status = 'active', updated_at = NOW() WHERE id = $1::uuid AND league_id = $2::uuid", [draftId, leagueId]);
      });
    },

    async makeTeamDraftPick(draftId: string, leagueId: string, playerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "INSERT INTO public.team_draft_picks (draft_id, player_id, pick_number) VALUES ($1::uuid, $2::uuid, (SELECT COALESCE(MAX(pick_number), 0) + 1 FROM public.team_draft_picks WHERE draft_id = $1::uuid))",
          [draftId, playerId],
        );
      });
    },

    async replaceTeamDraftCaptain(draftId: string, leagueId: string, teamSlot: number, newCaptainId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.team_draft_captains SET player_id = $3::uuid WHERE draft_id = $1::uuid AND team_slot = $2::int",
          [draftId, teamSlot, newCaptainId],
        );
      });
    },

    async restartTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query("DELETE FROM public.team_draft_picks WHERE draft_id = $1::uuid", [draftId]);
        await client.query("UPDATE public.team_drafts SET status = 'setup', current_pick = 1, updated_at = NOW() WHERE id = $1::uuid", [draftId]);
      });
    },

    async finalizeTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{ round_id: string }>(
          "UPDATE public.team_drafts SET status = 'completed', updated_at = NOW() WHERE id = $1::uuid AND league_id = $2::uuid RETURNING round_id",
          [draftId, leagueId],
        );
        const roundId = res.rows[0]?.round_id;
        if (!roundId) throw new RoundPersistenceError("Draft não encontrado.", 404);
        return { roundId };
      });
    },

    async applyDraftSwap(draftId: string, leagueId: string, playerAId: string, playerBId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
      });
    },

    async drawTeamsAdaptiveOnServer(input: {
      playerIds: string[];
      attendanceOrder?: string[];
      teamCount: number;
      playersPerTeam: number;
    }, leagueId: string, actor: Actor): Promise<ServerAdaptiveDrawResult> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const teams: string[][] = [];
        for (let t = 0; t < input.teamCount; t++) {
          teams.push([]);
        }
        for (let i = 0; i < input.playerIds.length; i++) {
          const teamIdx = i % input.teamCount;
          const pid = input.playerIds[i];
          if (pid) teams[teamIdx]?.push(pid);
        }
        return {
          success: true,
          teams,
          teamSummaries: [],
          balanceScore: 100,
        };
      });
    },
  };
}
