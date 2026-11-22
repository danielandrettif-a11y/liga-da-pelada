import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type {
  ScoringRulesRepository,
} from "../application/manage-scoring-rules.js";
import {
  BQ_SCORING_V5,
  type BQBaseScoringSnapshot,
  type ColumnCScoringSettings,
  DEFAULT_COLUMN_C_SCORING,
  rankingRulesToSnapshot,
} from "../domain/scoring-policy.js";

export class ScoringRulesPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ScoringRulesPersistenceError";
  }
}

function translatePersistenceError(error: unknown): ScoringRulesPersistenceError {
  if (error instanceof ScoringRulesPersistenceError) return error;
  const err = error as Error & { code?: string };
  const message = err.message || "";

  if (message.includes("Somente administradores") || message.includes("ADMIN_REQUIRED")) {
    return new ScoringRulesPersistenceError(
      "Apenas administradores podem alterar as regras de pontuação.",
      403,
    );
  }
  if (message.includes("Liga") && message.includes("não encontrada")) {
    return new ScoringRulesPersistenceError("Liga não encontrada.", 404);
  }
  if (message.includes("Pontos por gol sofrido") || message.includes("scouts sao obrigatorios")) {
    return new ScoringRulesPersistenceError(message, 400);
  }
  return new ScoringRulesPersistenceError(
    message || "Erro interno ao acessar as regras de pontuação.",
    500,
  );
}

async function assertAdmin(client: PoolClient, leagueId: string) {
  const result = await client.query<{ is_admin: boolean }>(
    `SELECT (
      COALESCE(public.is_league_admin($1::uuid), false)
      OR EXISTS (
        SELECT 1 FROM public.league_members
        WHERE league_id = $1::uuid AND user_id = auth.uid() AND role = 'admin'
      )
    ) AS is_admin`,
    [leagueId],
  );
  if (!result.rows[0]?.is_admin) {
    throw new ScoringRulesPersistenceError(
      "Apenas administradores podem alterar as regras de pontuação.",
      403,
    );
  }
}

export function pgScoringRulesRepository(pool: Pool): ScoringRulesRepository {
  return {
    async getBQScoringRules(leagueId, actor): Promise<BQBaseScoringSnapshot> {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{ event_type: string; points: number }>(
            `SELECT event_type, points::float
             FROM public.ranking_rules
             WHERE league_id = $1::uuid`,
            [leagueId],
          );

          if (!result.rows || result.rows.length === 0) {
            return BQ_SCORING_V5;
          }

          return rankingRulesToSnapshot(result.rows, 5);
        });
      } catch (error) {
        throw translatePersistenceError(error);
      }
    },

    async getColumnCScoringRules(leagueId, actor): Promise<ColumnCScoringSettings> {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{
            attacker_goal_points: number | null;
            attacker_assist_points: number | null;
            line_goal_conceded_points: number | null;
            defender_goal_points: number | null;
            defender_assist_points: number | null;
            defender_clean_sheet_points: number | null;
            defender_one_goal_points: number | null;
            defender_one_goal_conceded_points: number | null;
            defender_two_goals_conceded_points: number | null;
            goalkeeper_slot_appearance_points: number | null;
            goalkeeper_slot_goal_conceded_points: number | null;
            goalkeeper_slot_clean_sheet_points: number | null;
            goalkeeper_slot_one_goal_points: number | null;
          }>(
            `SELECT
               attacker_goal_points::float,
               attacker_assist_points::float,
               line_goal_conceded_points::float,
               defender_goal_points::float,
               defender_assist_points::float,
               defender_clean_sheet_points::float,
               defender_one_goal_points::float,
               defender_one_goal_conceded_points::float,
               defender_two_goals_conceded_points::float,
               goalkeeper_slot_appearance_points::float,
               goalkeeper_slot_goal_conceded_points::float,
               goalkeeper_slot_clean_sheet_points::float,
               goalkeeper_slot_one_goal_points::float
             FROM public.fantasy_settings
             WHERE league_id = $1::uuid`,
            [leagueId],
          );

          const row = result.rows[0];
          if (!row) {
            return DEFAULT_COLUMN_C_SCORING;
          }

          return {
            attackerGoalPoints: row.attacker_goal_points ?? DEFAULT_COLUMN_C_SCORING.attackerGoalPoints,
            attackerAssistPoints: row.attacker_assist_points ?? DEFAULT_COLUMN_C_SCORING.attackerAssistPoints,
            lineGoalConcededPoints: row.line_goal_conceded_points ?? DEFAULT_COLUMN_C_SCORING.lineGoalConcededPoints,
            defenderGoalPoints: row.defender_goal_points ?? DEFAULT_COLUMN_C_SCORING.defenderGoalPoints,
            defenderAssistPoints: row.defender_assist_points ?? DEFAULT_COLUMN_C_SCORING.defenderAssistPoints,
            defenderCleanSheetPoints: row.defender_clean_sheet_points ?? DEFAULT_COLUMN_C_SCORING.defenderCleanSheetPoints,
            defenderOneGoalPoints: row.defender_one_goal_points ?? DEFAULT_COLUMN_C_SCORING.defenderOneGoalPoints,
            defenderOneGoalConcededPoints: row.defender_one_goal_conceded_points ?? DEFAULT_COLUMN_C_SCORING.defenderOneGoalConcededPoints,
            defenderTwoGoalsConcededPoints: row.defender_two_goals_conceded_points ?? DEFAULT_COLUMN_C_SCORING.defenderTwoGoalsConcededPoints,
            goalkeeperSlotAppearancePoints: row.goalkeeper_slot_appearance_points ?? DEFAULT_COLUMN_C_SCORING.goalkeeperSlotAppearancePoints,
            goalkeeperSlotGoalConcededPoints: row.goalkeeper_slot_goal_conceded_points ?? DEFAULT_COLUMN_C_SCORING.goalkeeperSlotGoalConcededPoints,
            goalkeeperSlotCleanSheetPoints: row.goalkeeper_slot_clean_sheet_points ?? DEFAULT_COLUMN_C_SCORING.goalkeeperSlotCleanSheetPoints,
            goalkeeperSlotOneGoalPoints: row.goalkeeper_slot_one_goal_points ?? DEFAULT_COLUMN_C_SCORING.goalkeeperSlotOneGoalPoints,
          };
        });
      } catch (error) {
        throw translatePersistenceError(error);
      }
    },

    async saveBQScoringRules(leagueId, snapshot, actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);

          const result = await client.query<{ result: { success: boolean; version: number } }>(
            `SELECT public.save_bq_scoring_rules($1::uuid, $2::jsonb) AS result`,
            [leagueId, JSON.stringify(snapshot)],
          );

          const data = result.rows[0]?.result;
          return {
            success: Boolean(data?.success ?? true),
            version: data?.version ?? 5,
          };
        });
      } catch (error) {
        throw translatePersistenceError(error);
      }
    },

    async saveColumnCScoringRules(leagueId, settings, options, actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          await assertAdmin(client, leagueId);

          const result = await client.query<{
            result: { rounds_reprocessed?: number; player_rounds_reprocessed?: number };
          }>(
            `SELECT public.save_column_c_scoring_settings(
               $1::uuid,
               $2::numeric, $3::numeric, $4::numeric,
               $5::numeric, $6::numeric, $7::numeric,
               $8::numeric, $9::numeric, $10::numeric,
               $11::numeric, $12::numeric, $13::numeric,
               $14::numeric, $15::boolean
             ) AS result`,
            [
              leagueId,
              settings.attackerGoalPoints,
              settings.attackerAssistPoints,
              settings.lineGoalConcededPoints,
              settings.defenderGoalPoints,
              settings.defenderAssistPoints,
              settings.defenderCleanSheetPoints,
              settings.defenderOneGoalPoints,
              settings.defenderOneGoalConcededPoints,
              settings.defenderTwoGoalsConcededPoints,
              settings.goalkeeperSlotAppearancePoints,
              settings.goalkeeperSlotGoalConcededPoints,
              settings.goalkeeperSlotCleanSheetPoints,
              settings.goalkeeperSlotOneGoalPoints,
              Boolean(options.reprocessRanked),
            ],
          );

          const data = result.rows[0]?.result;
          return {
            success: true,
            roundsReprocessed: Number(data?.rounds_reprocessed || 0),
            playerRoundsReprocessed: Number(data?.player_rounds_reprocessed || 0),
          };
        });
      } catch (error) {
        throw translatePersistenceError(error);
      }
    },
  };
}

