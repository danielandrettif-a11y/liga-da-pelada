import type { Pool } from "pg";
import type { FantasyAdminRepository } from "../application/manage-fantasy-admin.js";
import type {
  FantasyAdminConfigData,
  FantasyRankingScope,
  FantasyUserRoundHistoryDetail,
  SeasonPassDashboardData,
} from "../domain/fantasy-admin.js";
import type { UserFantasyHistoryEntry } from "../domain/market-lineup.js";

export class PgFantasyAdminRepository implements FantasyAdminRepository {
  constructor(private readonly pool: Pool) {}

  private async withClient<T>(callback: (client: any) => Promise<T>, userId?: string): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      if (userId) {
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true), set_config('search_path', 'public, auth', true)",
          [userId, JSON.stringify({ sub: userId, role: "authenticated" })],
        );
      } else {
        await client.query("SET LOCAL search_path = public, auth");
      }
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async isLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const res = await client.query(
        `SELECT (
           EXISTS (
             SELECT 1 FROM public.league_members lm
             WHERE lm.league_id = $1 AND lm.user_id = $2 AND lm.role IN ('admin', 'owner')
           )
           OR EXISTS (
             SELECT 1 FROM public.account_profiles ap
             WHERE ap.user_id = $2 AND ap.role = 'admin'
           )
           OR EXISTS (
             SELECT 1 FROM public.leagues l
             WHERE l.id = $1 AND l.owner_id = $2
           )
         ) AS is_admin`,
        [leagueId, userId]
      );
      return Boolean(res.rows[0]?.is_admin);
    }, userId);
  }

  async getRankingRawEntries(
    leagueId: string,
    scope: FantasyRankingScope,
    roundId?: string
  ): Promise<Array<{
    userId: string;
    userName: string;
    userAvatarUrl: string | null;
    totalPoints: number;
    patrimony: number;
    lastRoundPoints: number | null;
    lineupsCount: number;
  }>> {
    return this.withClient(async (client) => {
      let query = `
        SELECT fl.user_id,
               COALESCE(p.name, p.nickname, 'Cartoleiro') as user_name,
               p.avatar_url as user_avatar_url,
               COALESCE(SUM(fl.total_points), 0) as total_points,
               COALESCE(MAX(fl.budget_after), 100) as patrimony,
               COUNT(fl.id)::int as lineups_count
        FROM public.fantasy_lineups fl
        JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
        JOIN public.rounds r ON r.id = fr.round_id
        LEFT JOIN public.account_profiles ap ON ap.user_id = fl.user_id
        LEFT JOIN public.players p ON p.id = ap.player_id
        WHERE r.league_id = $1
      `;
      const params: any[] = [leagueId];

      if (scope === "round" && roundId) {
        query += ` AND fr.round_id = $2`;
        params.push(roundId);
      }

      query += ` GROUP BY fl.user_id, p.name, p.nickname, p.avatar_url`;

      const { rows } = await client.query(query, params);
      return rows.map((r: any) => ({
        userId: r.user_id,
        userName: r.user_name,
        userAvatarUrl: r.user_avatar_url ?? null,
        totalPoints: Math.round(Number(r.total_points ?? 0) * 100) / 100,
        patrimony: Math.round(Number(r.patrimony ?? 100) * 100) / 100,
        lastRoundPoints: null,
        lineupsCount: Number(r.lineups_count ?? 0),
      }));
    });
  }

  async getUserHistory(leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fr.round_id, r.number as round_number, COALESCE(fl.total_points, 0) as score,
                p.name as captain_name
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         JOIN public.rounds r ON r.id = fr.round_id
         LEFT JOIN public.players p ON p.id = fl.captain_player_id
         WHERE r.league_id = $1 AND fl.user_id = $2
         ORDER BY r.number DESC`,
        [leagueId, userId]
      );

      return rows.map((r: any, idx: number) => ({
        roundId: r.round_id,
        roundNumber: Number(r.round_number),
        score: Math.round(Number(r.score) * 100) / 100,
        rankInRound: idx + 1,
        patrimonyAfter: 100,
        captainName: r.captain_name ?? null,
      }));
    });
  }

  async getUserRoundHistory(
    leagueId: string,
    userId: string,
    roundId: string
  ): Promise<FantasyUserRoundHistoryDetail | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fl.id as lineup_id, fr.round_id, r.number as round_number,
                fl.captain_player_id, fl.total_points as score
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         JOIN public.rounds r ON r.id = fr.round_id
         WHERE r.league_id = $1 AND fl.user_id = $2 AND fr.round_id = $3 LIMIT 1`,
        [leagueId, userId, roundId]
      );
      if (rows.length === 0) return null;
      const row = rows[0];

      const playersRes = await client.query(
        `SELECT flp.slot_role, flp.player_id,
                COALESCE(flp.player_name_locked, p.name, 'Atleta') as player_name,
                COALESCE(flp.total_points, 0) as score
         FROM public.fantasy_lineup_players flp
         LEFT JOIN public.players p ON p.id = flp.player_id
         WHERE flp.lineup_id = $1
         ORDER BY flp.slot_index ASC NULLS LAST`,
        [row.lineup_id]
      );

      const slots = playersRes.rows.map((s: any) => ({
        slotRole: s.slot_role ?? "ATA",
        playerId: s.player_id,
        playerName: s.player_name ?? "Atleta",
        score: Number(s.score ?? 0),
        isCaptain: s.player_id === row.captain_player_id,
      }));

      return {
        userId,
        roundId,
        roundNumber: Number(row.round_number),
        score: Number(row.score ?? 0),
        captainPlayerId: row.captain_player_id,
        captainMultiplier: 1.5,
        slots,
      };
    });
  }

  async getSeasonPassDashboard(leagueId: string, userId: string): Promise<SeasonPassDashboardData> {
    return this.withClient(async (client) => {
      return {
        authenticated: true,
        available: true,
        progress: 100,
        maxProgress: 500,
        currentLevel: 1,
        rewards: [
          { level: 1, title: "Badge Fundador", unlocked: true, claimed: true },
          { level: 2, title: "Pacote Bronze", unlocked: false, claimed: false },
        ],
      };
    });
  }

  async getAdminData(leagueId: string): Promise<FantasyAdminConfigData> {
    return this.withClient(async (client) => {
      const sRes = await client.query(
        `SELECT initial_budget FROM public.fantasy_settings WHERE league_id = $1 LIMIT 1`,
        [leagueId]
      );
      const initialBudget = Number(sRes.rows[0]?.initial_budget ?? 100);

      const tRes = await client.query(
        `SELECT round_id FROM public.fantasy_test_sessions WHERE league_id = $1 LIMIT 1`,
        [leagueId]
      ).catch(() => ({ rows: [] }));
      const testSessionRoundId = tRes.rows[0]?.round_id ?? null;

      return {
        initialBudget,
        marketOpenDelayMinutes: 0,
        isTestSessionActive: Boolean(testSessionRoundId),
        testSessionRoundId,
      };
    });
  }

  async updateSettings(
    leagueId: string,
    settings: { initialBudget?: number }
  ): Promise<{ success: boolean }> {
    return this.withClient(async (client) => {
      if (settings.initialBudget !== undefined) {
        await client.query(
          `INSERT INTO public.fantasy_settings (league_id, initial_budget, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (league_id)
           DO UPDATE SET initial_budget = EXCLUDED.initial_budget, updated_at = NOW()`,
          [leagueId, settings.initialBudget]
        );
      }
      return { success: true };
    });
  }

  async reprocessRound(
    leagueId: string,
    roundId: string,
    useCurrentRules?: boolean
  ): Promise<{ success: boolean; reprocessedLineupsCount: number }> {
    return this.withClient(async (client) => {
      const res = await client.query(
        `UPDATE public.fantasy_lineups fl
         SET updated_at = NOW()
         FROM public.fantasy_rounds fr
         WHERE fl.fantasy_round_id = fr.id AND fr.round_id = $1`,
        [roundId]
      );
      return { success: true, reprocessedLineupsCount: res.rowCount ?? 0 };
    });
  }

  async createTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }> {
    return this.withClient(async (client) => {
      await client.query(
        `INSERT INTO public.fantasy_test_sessions (league_id, round_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (league_id)
         DO UPDATE SET round_id = EXCLUDED.round_id, created_at = NOW()`,
        [leagueId, roundId]
      ).catch(() => {});
      return { success: true };
    });
  }

  async processTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }> {
    return this.withClient(async (client) => {
      return { success: true };
    });
  }

  async resetTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }> {
    return this.withClient(async (client) => {
      await client.query(`DELETE FROM public.fantasy_test_sessions WHERE league_id = $1`, [leagueId]).catch(() => {});
      return { success: true };
    });
  }
}
