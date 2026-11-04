import type { Pool, QueryResult, QueryResultRow } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import { buildOverallHistoryInput } from "../domain/overall-history.js";
import type {
  OverallHistoryData,
  OverallPlayerSource,
  OverallShadowRepository,
} from "../application/manage-overall-shadow.js";

export class PgOverallShadowRepository implements OverallShadowRepository {
  constructor(private readonly db: Pool) {}

  private queryAs<T extends QueryResultRow = any>(
    actor: Actor,
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return withAuthenticatedTransaction(this.db, actor, (client) => client.query<T>(text, values));
  }

  async checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean> {
    return withAuthenticatedTransaction(this.db, actor, async (client) => {
      const res = await client.query<{ is_admin: boolean }>(
        "SELECT public.is_league_admin($1::uuid) AS is_admin",
        [leagueId],
      );
      return Boolean(res.rows[0]?.is_admin);
    });
  }

  async getFormula(actor: Actor, key: string): Promise<{ id: string; label: string; config?: any } | null> {
    const result = await this.queryAs<{ id: string; label: string; config: any }>(actor,
      `SELECT id, label, config FROM public.overall_formula_versions WHERE key = $1 LIMIT 1`,
      [key],
    );
    return result.rows[0] || null;
  }

  async loadHistory(actor: Actor, leagueId: string): Promise<OverallHistoryData> {
    const [membersRes, roundsRes] = await Promise.all([
      this.queryAs<{
        player_id: string;
        name: string;
        player_profile: string | null;
        initial_player_profile: string | null;
        overall_traits: string[];
        overall_seed_mode: string | null;
        is_goalkeeper: boolean;
        member_category: string;
      }>(actor,
        `SELECT lm.player_id, p.name,
                COALESCE(lm.player_profile, p.player_profile) as player_profile,
                COALESCE(lm.initial_player_profile, lm.player_profile, p.initial_player_profile, p.player_profile) as initial_player_profile,
                COALESCE(lm.overall_traits, p.overall_traits) as overall_traits,
                COALESCE(lm.overall_seed_mode, p.overall_seed_mode) as overall_seed_mode,
                p.is_goalkeeper, p.member_category
         FROM public.league_members lm
         JOIN public.players p ON p.id = lm.player_id
         WHERE lm.league_id = $1 AND p.member_category = 'player'`,
        [leagueId],
      ),
      this.queryAs<{
        id: string;
        number: number;
        date: string;
        round_type: string;
        status: string;
      }>(actor,
        `SELECT id, number, date, round_type, status
         FROM public.rounds
         WHERE league_id = $1 AND round_type = 'official' AND status = 'finished'
         ORDER BY date ASC, created_at ASC`,
        [leagueId],
      ),
    ]);

    const officialPlayers: OverallPlayerSource[] = membersRes.rows.map((r: any) => ({
      id: r.player_id,
      name: r.name || "Jogador",
      playerProfile: r.player_profile as OverallPlayerSource["playerProfile"],
      initialPlayerProfile: r.initial_player_profile as OverallPlayerSource["initialPlayerProfile"],
      overallTraits: Array.isArray(r.overall_traits) ? r.overall_traits : [],
      overallSeedMode: r.overall_seed_mode,
      isGoalkeeper: Boolean(r.is_goalkeeper),
    }));

    const pendingPlayers = officialPlayers
      .filter((p: OverallPlayerSource) => (p.overallTraits || []).length < 1 || (p.overallTraits || []).length > 2)
      .map(({ id, name }) => ({ id, name }));

    const roundIds = roundsRes.rows.map((round) => round.id);
    if (roundIds.length === 0) {
      return { players: officialPlayers, pendingPlayers, rounds: [], zeroPointOverrides: [] };
    }

    const [statsRes, matchesRes, overridesRes] = await Promise.all([
      this.queryAs<any>(actor,
        `SELECT round_id, player_id, player_profile_locked, goals, assists, own_goals
         FROM public.player_round_stats WHERE round_id = ANY($1::uuid[])`,
        [roundIds],
      ),
      this.queryAs<any>(actor,
        `SELECT id, round_id, status, team_a_id, team_b_id, score_a, score_b,
                duration_seconds, timer_accumulated_seconds, eligibility_elapsed_offset_seconds
         FROM public.matches WHERE round_id = ANY($1::uuid[])`,
        [roundIds],
      ),
      this.queryAs<{ round_id: string; player_id: string }>(actor,
        `SELECT override_item.round_id, override_item.player_id
         FROM public.player_round_stat_overrides override_item
         JOIN public.rounds round_item ON round_item.id = override_item.round_id
         WHERE round_item.league_id = $1 AND override_item.override_type = 'zero_points'`,
        [leagueId],
      ),
    ]);
    const matchIds = matchesRes.rows.map((match: any) => match.id);
    const emptyRows = { rows: [] as any[] };
    const [eventsRes, playersRes, goalkeepersRes, stintsRes] = matchIds.length > 0
      ? await Promise.all([
          this.queryAs<any>(actor,
            `SELECT match_id, player_id, assist_player_id, team_id, is_own_goal, elapsed_seconds, minute,
                    goalkeeper_a_player_id, goalkeeper_b_player_id
             FROM public.match_events WHERE match_id = ANY($1::uuid[])`,
            [matchIds],
          ),
          this.queryAs<any>(actor,
            `SELECT match_id, player_id, team_id, entered_elapsed_seconds, left_elapsed_seconds
             FROM public.match_players WHERE match_id = ANY($1::uuid[])`,
            [matchIds],
          ),
          this.queryAs<any>(actor,
            `SELECT match_id, player_id, team_id
             FROM public.match_goalkeepers WHERE match_id = ANY($1::uuid[])`,
            [matchIds],
          ),
          this.queryAs<any>(actor,
            `SELECT match_id, player_id, team_id, entered_elapsed_seconds, left_elapsed_seconds, selected_at
             FROM public.match_goalkeeper_stints WHERE match_id = ANY($1::uuid[])`,
            [matchIds],
          ),
        ])
      : [emptyRows, emptyRows, emptyRows, emptyRows];

    const groupBy = (rows: any[], key: string) => {
      const grouped = new Map<string, any[]>();
      for (const row of rows) grouped.set(row[key], [...(grouped.get(row[key]) || []), row]);
      return grouped;
    };
    const statsByRound = groupBy(statsRes.rows, "round_id");
    const matchesByRound = groupBy(matchesRes.rows, "round_id");
    const eventsByMatch = groupBy(eventsRes.rows, "match_id");
    const playersByMatch = groupBy(playersRes.rows, "match_id");
    const goalkeepersByMatch = groupBy(goalkeepersRes.rows, "match_id");
    const stintsByMatch = groupBy(stintsRes.rows, "match_id");
    const rawRounds = roundsRes.rows.map((round: any) => ({
      ...round,
      player_round_stats: statsByRound.get(round.id) || [],
      matches: (matchesByRound.get(round.id) || []).map((match: any) => ({
        ...match,
        match_events: eventsByMatch.get(match.id) || [],
        match_players: playersByMatch.get(match.id) || [],
        match_goalkeepers: goalkeepersByMatch.get(match.id) || [],
        match_goalkeeper_stints: stintsByMatch.get(match.id) || [],
      })),
    }));
    const history = buildOverallHistoryInput({
      players: officialPlayers,
      rounds: rawRounds,
      zeroPointOverrides: overridesRes.rows,
    });
    return {
      ...history,
      players: history.players as OverallPlayerSource[],
      pendingPlayers,
      zeroPointOverrides: overridesRes.rows,
    };
  }

  async getLatestRun(actor: Actor, leagueId: string, formulaId: string) {
    const result = await this.queryAs<{
      id: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      error_message: string | null;
      formula_version_id: string;
    }>(actor,
      `SELECT id, status, created_at, completed_at, error_message, formula_version_id
       FROM public.overall_calculation_runs
       WHERE league_id = $1 AND formula_version_id = $2 AND status IN ('succeeded', 'published', 'failed')
       ORDER BY created_at DESC LIMIT 1`,
      [leagueId, formulaId],
    );
    return result.rows[0] || null;
  }

  async getRunById(actor: Actor, runId: string, leagueId: string) {
    const result = await this.queryAs<{
      id: string;
      status: string;
      formula_version_id: string;
    }>(actor,
      `SELECT id, status, formula_version_id
       FROM public.overall_calculation_runs
       WHERE id = $1 AND league_id = $2 LIMIT 1`,
      [runId, leagueId],
    );
    return result.rows[0] || null;
  }

  async getSnapshots(actor: Actor, runId: string) {
    const result = await this.queryAs<any>(actor,
      `SELECT s.*, p.name as player_name
       FROM public.player_overall_snapshots s
       LEFT JOIN public.players p ON p.id = s.player_id
       WHERE s.calculation_run_id = $1
       ORDER BY s.overall DESC`,
      [runId],
    );
    return result.rows.map((r: any) => ({
      ...r,
      player: { name: r.player_name || "Jogador" },
    }));
  }

  async getBreakdowns(actor: Actor, runId: string) {
    const result = await this.queryAs<any>(actor,
      `SELECT *
       FROM public.player_overall_round_breakdowns
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
    const result = await withAuthenticatedTransaction(this.db, { userId: params.createdBy }, (client) => client.query<{ id: string }>(
      `INSERT INTO public.overall_calculation_runs (league_id, formula_version_id, source_through_round_id, created_by, status, started_at)
       VALUES ($1, $2, $3, $4, 'processing', now()) RETURNING id`,
      [params.leagueId, params.formulaVersionId, params.sourceThroughRoundId, params.createdBy],
    ));
    const row = result.rows[0];
    if (!row) throw new Error("Não foi possível criar a execução de OVR.");
    return row.id;
  }

  async saveCalculatedData(params: {
    runId: string;
    snapshots: any[];
    breakdowns: any[];
  }, userId: string): Promise<void> {
    await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
      for (const s of params.snapshots) {
        await client.query(
        `INSERT INTO public.player_overall_snapshots
         (calculation_run_id, player_id, overall, def_overall, ala_mei_overall, ata_overall, gol_overall, confidence, rounds_played, is_provisional, is_stale, data_quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          params.runId,
          s.playerId || s.player_id,
          s.overall,
          s.positions?.DEF?.value ?? s.def_overall ?? s.def,
          s.positions?.ALA_MEI?.value ?? s.ala_mei_overall ?? s.alaMei,
          s.positions?.ATA?.value ?? s.ata_overall ?? s.ata,
          s.positions?.GOL?.value ?? s.gol_overall ?? s.gol,
          Math.max(s.positions?.DEF?.confidence || 0, s.positions?.ALA_MEI?.confidence || 0, s.positions?.ATA?.confidence || 0),
          s.roundsPlayed ?? s.rounds_played ?? 0,
          s.isProvisional ?? s.is_provisional ?? s.provisional ?? false,
          s.isStale ?? s.is_stale ?? s.stale ?? false,
          JSON.stringify({
            mode: "shadow",
            effective_profile: s.effectiveProfile,
            profile_source: "admin_fixed",
            scout_totals: s.scoutTotals,
            position_confidence: Object.fromEntries(Object.entries(s.positions || {}).map(([role, position]: [string, any]) => [role, position.confidence])),
            overall_trend: s.trend,
            position_trends: s.positionTrends,
          }),
        ],
        );
      }
      for (const item of params.breakdowns) {
        await client.query(
          `INSERT INTO public.player_overall_round_breakdowns
           (calculation_run_id, player_id, round_id, round_date, round_index, goals, assists, own_goals,
            goals_conceded, attacking_score, goal_score, assist_score, defensive_score, timing_quality,
            played_profile, profile_decision_source, profile_appearance_number, profile_def_overall,
            profile_ata_overall, role_evidence, trait_evidence, positions, position_confidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [params.runId, item.playerId, item.roundId, item.roundDate, item.roundIndex, item.goals,
            item.assists, item.ownGoals, item.goalsConceded, item.attackingScore, item.goalScore,
            item.assistScore, item.defensiveScore, item.timingQuality, item.playedProfile,
            item.profileSource, item.appearanceNumber, item.profileDefOverall, item.profileAtaOverall,
            JSON.stringify(item.roleEvidence), JSON.stringify(item.traitEvidence), JSON.stringify(item.positions),
            JSON.stringify(item.confidence)],
        );
      }
    });
  }

  async markRunSucceeded(runId: string, leagueId: string, userId: string): Promise<void> {
    const result = await withAuthenticatedTransaction(this.db, { userId }, (client) => client.query(
      `UPDATE public.overall_calculation_runs
       SET status = 'succeeded', completed_at = now()
       WHERE id = $1 AND league_id = $2`,
      [runId, leagueId],
    ));
    if (!result.rowCount) throw new Error("Execução de OVR não encontrada.");
  }

  async markRunFailed(runId: string, leagueId: string, error: string, userId: string): Promise<void> {
    const result = await withAuthenticatedTransaction(this.db, { userId }, (client) => client.query(
      `UPDATE public.overall_calculation_runs
       SET status = 'failed', completed_at = now(), error_message = $3
       WHERE id = $1 AND league_id = $2`,
      [runId, leagueId, error],
    ));
    if (!result.rowCount) throw new Error("Execução de OVR não encontrada.");
  }

  async markRunPublished(runId: string, leagueId: string, userId: string): Promise<void> {
    const result = await withAuthenticatedTransaction(this.db, { userId }, (client) => client.query(
      `UPDATE public.overall_calculation_runs
       SET status = 'published', published_at = now()
       WHERE id = $1 AND league_id = $2 AND status = 'succeeded'`,
      [runId, leagueId],
    ));
    if (!result.rowCount) throw new Error("Execução de OVR não está pronta para publicação.");
  }
}
