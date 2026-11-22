import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type {
  OverallHistoryData,
  OverallPlayerSource,
  OverallShadowRepository,
} from "../application/manage-overall-shadow.js";

export class PgOverallShadowRepository implements OverallShadowRepository {
  constructor(private readonly db: Pool) {}

  async checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean> {
    const res = await this.db.query<{ is_admin: boolean }>(
      `SELECT (lm.role = 'admin' OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = $1 AND p.is_app_admin = true)) as is_admin
       FROM league_members lm
       WHERE lm.player_id = $1 AND lm.league_id = $2
       LIMIT 1`,
      [actor.userId, leagueId],
    );
    return Boolean(res.rows[0]?.is_admin);
  }

  async getFormula(key: string): Promise<{ id: string; label: string; config?: any } | null> {
    const result = await this.db.query<{ id: string; label: string; config: any }>(
      `SELECT id, label, config FROM overall_formula_versions WHERE key = $1 LIMIT 1`,
      [key],
    );
    return result.rows[0] || null;
  }

  async loadHistory(leagueId: string): Promise<OverallHistoryData> {
    const [membersRes, roundsRes, overridesRes] = await Promise.all([
      this.db.query<{
        player_id: string;
        name: string;
        player_profile: string | null;
        initial_player_profile: string | null;
        overall_traits: string[];
        overall_seed_mode: string | null;
        is_goalkeeper: boolean;
        member_category: string;
      }>(
        `SELECT lm.player_id, p.name,
                COALESCE(lm.player_profile, p.player_profile) as player_profile,
                COALESCE(lm.initial_player_profile, lm.player_profile, p.initial_player_profile, p.player_profile) as initial_player_profile,
                COALESCE(lm.overall_traits, p.overall_traits) as overall_traits,
                COALESCE(lm.overall_seed_mode, p.overall_seed_mode) as overall_seed_mode,
                p.is_goalkeeper, lm.member_category
         FROM league_members lm
         JOIN players p ON p.id = lm.player_id
         WHERE lm.league_id = $1 AND lm.member_category = 'player'`,
        [leagueId],
      ),
      this.db.query<{
        id: string;
        number: number;
        date: string;
        round_type: string;
        status: string;
      }>(
        `SELECT id, number, date, round_type, status
         FROM rounds
         WHERE league_id = $1 AND round_type = 'official' AND status = 'finished'
         ORDER BY date ASC, created_at ASC`,
        [leagueId],
      ),
      this.db.query<{ round_id: string; player_id: string }>(
        `SELECT round_id, player_id
         FROM player_round_stat_overrides
         WHERE override_type = 'zero_points'`,
        [],
      ),
    ]);

    const officialPlayers: OverallPlayerSource[] = membersRes.rows.map((r: any) => ({
      id: r.player_id,
      name: r.name || "Jogador",
      playerProfile: r.player_profile,
      initialPlayerProfile: r.initial_player_profile,
      overallTraits: Array.isArray(r.overall_traits) ? r.overall_traits : [],
      overallSeedMode: r.overall_seed_mode,
      isGoalkeeper: Boolean(r.is_goalkeeper),
    }));

    const pendingPlayers = officialPlayers
      .filter((p: OverallPlayerSource) => p.overallTraits.length < 1 || p.overallTraits.length > 2)
      .map(({ id, name }) => ({ id, name }));

    return {
      players: officialPlayers,
      pendingPlayers,
      rounds: roundsRes.rows.map((r: any) => ({ ...r, roundType: r.round_type })),
      zeroPointOverrides: overridesRes.rows,
    };
  }

  async getLatestRun(leagueId: string, formulaId: string) {
    const result = await this.db.query<{
      id: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      error_message: string | null;
      formula_version_id: string;
    }>(
      `SELECT id, status, created_at, completed_at, error_message, formula_version_id
       FROM overall_calculation_runs
       WHERE league_id = $1 AND formula_version_id = $2 AND status IN ('succeeded', 'published', 'failed')
       ORDER BY created_at DESC LIMIT 1`,
      [leagueId, formulaId],
    );
    return result.rows[0] || null;
  }

  async getRunById(runId: string, leagueId: string) {
    const result = await this.db.query<{
      id: string;
      status: string;
      formula_version_id: string;
    }>(
      `SELECT id, status, formula_version_id
       FROM overall_calculation_runs
       WHERE id = $1 AND league_id = $2 LIMIT 1`,
      [runId, leagueId],
    );
    return result.rows[0] || null;
  }

  async getSnapshots(runId: string) {
    const result = await this.db.query<any>(
      `SELECT s.*, p.name as player_name
       FROM player_overall_snapshots s
       LEFT JOIN players p ON p.id = s.player_id
       WHERE s.calculation_run_id = $1
       ORDER BY s.overall DESC`,
      [runId],
    );
    return result.rows.map((r: any) => ({
      ...r,
      player: { name: r.player_name || "Jogador" },
    }));
  }

  async getBreakdowns(runId: string) {
    const result = await this.db.query<any>(
      `SELECT *
       FROM player_overall_round_breakdowns
       WHERE calculation_run_id = $1
       ORDER BY round_index DESC`,
      [runId],
    );
    return result.rows;
  }

  async createRun(params: {
    leagueId: string;
    formulaVersionId: string;
    sourceThroughRoundId: string | null;
    createdBy: string;
  }): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO overall_calculation_runs (league_id, formula_version_id, source_through_round_id, created_by, status, started_at)
       VALUES ($1, $2, $3, $4, 'processing', now())
       RETURNING id`,
      [params.leagueId, params.formulaVersionId, params.sourceThroughRoundId, params.createdBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Não foi possível criar a execução de OVR.");
    return row.id;
  }

  async saveCalculatedData(params: {
    runId: string;
    snapshots: any[];
    breakdowns: any[];
  }): Promise<void> {
    for (const s of params.snapshots) {
      await this.db.query(
        `INSERT INTO player_overall_snapshots
         (calculation_run_id, player_id, overall, def_overall, ala_mei_overall, ata_overall, gol_overall, confidence, rounds_played, is_provisional, is_stale, data_quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          params.runId,
          s.playerId || s.player_id,
          s.overall,
          s.def_overall ?? s.def,
          s.ala_mei_overall ?? s.alaMei,
          s.ata_overall ?? s.ata,
          s.gol_overall ?? s.gol,
          s.confidence,
          s.rounds_played ?? s.roundsPlayed ?? 0,
          s.is_provisional ?? s.provisional ?? false,
          s.is_stale ?? s.stale ?? false,
          JSON.stringify(s.data_quality || {}),
        ],
      );
    }
  }

  async markRunSucceeded(runId: string, leagueId: string): Promise<void> {
    await this.db.query(
      `UPDATE overall_calculation_runs
       SET status = 'succeeded', completed_at = now()
       WHERE id = $1 AND league_id = $2`,
      [runId, leagueId],
    );
  }

  async markRunFailed(runId: string, leagueId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE overall_calculation_runs
       SET status = 'failed', completed_at = now(), error_message = $3
       WHERE id = $1 AND league_id = $2`,
      [runId, leagueId, error],
    );
  }

  async markRunPublished(runId: string, leagueId: string): Promise<void> {
    await this.db.query(
      `UPDATE overall_calculation_runs
       SET status = 'published', published_at = now()
       WHERE id = $1 AND league_id = $2 AND status = 'succeeded'`,
      [runId, leagueId],
    );
  }
}
