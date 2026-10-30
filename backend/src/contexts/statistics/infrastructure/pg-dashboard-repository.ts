import type { Pool } from "pg";
import type { DashboardRawData, DashboardRepository } from "../application/manage-dashboard.js";

export class PgDashboardRepository implements DashboardRepository {
  constructor(private readonly db: Pool) {}

  async getActiveSeasonId(leagueId: string): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM seasons WHERE league_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [leagueId],
    );
    return result.rows[0]?.id || null;
  }

  async getDashboardData(leagueId: string, seasonId: string): Promise<DashboardRawData> {
    try {
      const readModelResult = await this.db.query<{ read_model: any }>(
        `SELECT get_home_read_model($1, $2) as read_model`,
        [seasonId, leagueId],
      );
      const readModel = readModelResult.rows[0]?.read_model;
      if (readModel && typeof readModel === "object") {
        return {
          league: readModel.league,
          nextRound: readModel.nextRound,
          nextFriendly: readModel.nextFriendly,
          liveMatch: readModel.liveMatch,
          lastRound: readModel.lastRound,
          activeCallups: readModel.activeCallups,
        };
      }
    } catch {
      // Fallback para consultas relacionais se a RPC não existir no schema
    }

    const [leagueRes, nextRoundRes, nextFriendlyRes, liveMatchRes, callupsRes] = await Promise.all([
      this.db.query<{
        match_duration: number;
        preseason_enabled: boolean;
        stadium_name: string | null;
        stadium_map_url: string | null;
        event_duration_minutes: number;
      }>(
        `SELECT match_duration, preseason_enabled, stadium_name, stadium_map_url, event_duration_minutes FROM leagues WHERE id = $1`,
        [leagueId],
      ),
      this.db.query<{ id: string; number: number; date: string; status: string }>(
        `SELECT r.*, (SELECT count(*)::int FROM round_players rp WHERE rp.round_id = r.id) as confirmed_count
         FROM rounds r
         WHERE r.season_id = $1 AND r.round_type = 'official' AND r.status IN ('draft', 'active')
         ORDER BY r.date ASC LIMIT 1`,
        [seasonId],
      ),
      this.db.query<{ id: string; number: number; date: string; status: string }>(
        `SELECT r.*, (SELECT count(*)::int FROM round_players rp WHERE rp.round_id = r.id) as confirmed_count
         FROM rounds r
         WHERE r.season_id = $1 AND r.round_type = 'friendly' AND r.status IN ('draft', 'active')
         ORDER BY r.date ASC LIMIT 1`,
        [seasonId],
      ),
      this.db.query<{
        id: string;
        score_a: number;
        score_b: number;
        status: string;
        round_id: string;
        round_number: number;
        team_a_id: string;
        team_b_id: string;
      }>(
        `SELECT m.*, r.number as round_number
         FROM matches m
         JOIN rounds r ON r.id = m.round_id
         WHERE m.status = 'live' AND r.season_id = $1
         ORDER BY m.created_at DESC LIMIT 1`,
        [seasonId],
      ),
      this.db.query<any>(
        `SELECT c.*,
          COALESCE(
            (SELECT json_agg(json_build_object('player_id', ce.player_id, 'status', ce.status, 'position', ce.position))
             FROM callup_entries ce WHERE ce.callup_id = c.id),
            '[]'::json
          ) as callup_entries
         FROM callups c
         WHERE c.league_id = $1 AND c.status IN ('open', 'locked', 'converted')
         ORDER BY c.date ASC`,
        [leagueId],
      ),
    ]);

    const leagueRow = leagueRes.rows[0];
    const nextRoundRow = nextRoundRes.rows[0];
    const nextFriendlyRow = nextFriendlyRes.rows[0];
    const liveMatchRow = liveMatchRes.rows[0];

    return {
      league: leagueRow ? {
        matchDuration: leagueRow.match_duration,
        preseasonEnabled: leagueRow.preseason_enabled,
        stadiumName: leagueRow.stadium_name,
        stadiumMapUrl: leagueRow.stadium_map_url,
        eventDurationMinutes: leagueRow.event_duration_minutes,
      } : null,
      nextRound: nextRoundRow ? {
        ...nextRoundRow,
        confirmedPlayers: (nextRoundRow as any).confirmed_count || 0,
      } : null,
      nextFriendly: nextFriendlyRow ? {
        ...nextFriendlyRow,
        confirmedPlayers: (nextFriendlyRow as any).confirmed_count || 0,
      } : null,
      liveMatch: liveMatchRow ? {
        ...liveMatchRow,
        round: { id: liveMatchRow.round_id, number: liveMatchRow.round_number, seasonId },
      } : null,
      activeCallups: callupsRes.rows,
      lastRound: null,
    };
  }
}
