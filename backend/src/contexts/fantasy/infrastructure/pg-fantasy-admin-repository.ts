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

  private async withClient<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("SET LOCAL ROLE authenticated");
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async isLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT 1 FROM league_members
         WHERE league_id = $1 AND user_id = $2 AND role IN ('admin', 'owner')
         LIMIT 1`,
        [leagueId, userId]
      );
      if (rows.length > 0) return true;

      const leagueRes = await client.query(
        `SELECT 1 FROM leagues WHERE id = $1 AND created_by = $2 LIMIT 1`,
        [leagueId, userId]
      );
      return (leagueRes.rowCount ?? 0) > 0;
    });
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
               COALESCE(SUM(fl.score), 0) as total_points,
               100 as patrimony,
               COUNT(fl.id)::int as lineups_count
        FROM fantasy_lineups fl
        JOIN rounds r ON r.id = fl.round_id
        LEFT JOIN profiles p ON p.id = fl.user_id
        WHERE r.league_id = $1
      `;
      const params: any[] = [leagueId];

      if (scope === "round" && roundId) {
        query += ` AND fl.round_id = $2`;
        params.push(roundId);
      }

      query += ` GROUP BY fl.user_id, p.name, p.nickname, p.avatar_url`;

      const { rows } = await client.query(query, params);
      return rows.map((r: any) => ({
        userId: r.user_id,
        userName: r.user_name,
        userAvatarUrl: r.user_avatar_url ?? null,
        totalPoints: Number(r.total_points ?? 0),
        patrimony: Number(r.patrimony ?? 100),
        lastRoundPoints: null,
        lineupsCount: Number(r.lineups_count ?? 0),
      }));
    });
  }

  async getUserHistory(leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fl.round_id, r.round_number, COALESCE(fl.score, 0) as score,
                p.name as captain_name
         FROM fantasy_lineups fl
         JOIN rounds r ON r.id = fl.round_id
         LEFT JOIN players p ON p.id = fl.captain_player_id
         WHERE r.league_id = $1 AND fl.user_id = $2
         ORDER BY r.round_number DESC`,
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
        `SELECT fl.round_id, r.round_number, fl.captain_player_id, fl.slots, fl.score
         FROM fantasy_lineups fl
         JOIN rounds r ON r.id = fl.round_id
         WHERE r.league_id = $1 AND fl.user_id = $2 AND fl.round_id = $3 LIMIT 1`,
        [leagueId, userId, roundId]
      );
      if (rows.length === 0) return null;
      const row = rows[0];

      const rawSlots = (row.slots as any[]) ?? [];
      const slots = rawSlots.map((s: any) => ({
        slotRole: s.slotRole ?? "ATA",
        playerId: s.playerId,
        playerName: s.playerName ?? "Atleta",
        score: Number(s.score ?? 0),
        isCaptain: s.playerId === row.captain_player_id,
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
        `SELECT initial_budget FROM fantasy_settings WHERE league_id = $1 LIMIT 1`,
        [leagueId]
      );
      const initialBudget = Number(sRes.rows[0]?.initial_budget ?? 100);

      const tRes = await client.query(
        `SELECT round_id FROM fantasy_test_sessions WHERE league_id = $1 LIMIT 1`,
        [leagueId]
      );
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
          `INSERT INTO fantasy_settings (league_id, initial_budget, updated_at)
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
        `UPDATE fantasy_lineups
         SET updated_at = NOW()
         WHERE round_id = $1 AND league_id = $2`,
        [roundId, leagueId]
      );
      return { success: true, reprocessedLineupsCount: res.rowCount ?? 0 };
    });
  }

  async createTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }> {
    return this.withClient(async (client) => {
      await client.query(
        `INSERT INTO fantasy_test_sessions (league_id, round_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (league_id)
         DO UPDATE SET round_id = EXCLUDED.round_id, created_at = NOW()`,
        [leagueId, roundId]
      );
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
      await client.query(`DELETE FROM fantasy_test_sessions WHERE league_id = $1`, [leagueId]);
      return { success: true };
    });
  }
}
