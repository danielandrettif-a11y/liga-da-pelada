"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import { calculatePlayerOveralls, type OverallPlayer } from "../overall";
import { buildOverallHistoryInput } from "../overall-history";

const FORMULA_KEY = "adaptive-v1-shadow";

function numberValue(value: unknown) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

async function loadOverallHistory(client: any) {
  const [{ data: players, error: playersError }, { data: rounds, error: roundsError }] = await Promise.all([
    client
      .from("players")
      .select("id, player_profile, is_goalkeeper")
      .eq("is_selectable", true)
      .in("member_category", ["player", "guest"]),
    client
      .from("rounds")
      .select(`
        id, number, date, round_type, status,
        player_round_stats (player_id, player_profile_locked, goals, assists, own_goals),
        matches (
          status, team_a_id, team_b_id, score_a, score_b,
          duration_seconds, timer_accumulated_seconds, eligibility_elapsed_offset_seconds,
          match_events (player_id, assist_player_id, team_id, is_own_goal, elapsed_seconds, minute),
          match_players (player_id, team_id, entered_elapsed_seconds, left_elapsed_seconds),
          match_goalkeepers (player_id, team_id)
        )
      `)
      .eq("round_type", "official")
      .eq("status", "finished")
      .order("date", { ascending: true })
      .order("number", { ascending: true }),
  ]);
  if (playersError) throw new Error(`Não foi possível carregar os jogadores: ${playersError.message}`);
  if (roundsError) throw new Error(`Não foi possível carregar o histórico: ${roundsError.message}`);

  const roundIds = (rounds || []).map((round: any) => round.id);
  const { data: overrides, error: overridesError } = roundIds.length
    ? await client.from("player_round_stat_overrides").select("round_id, player_id").in("round_id", roundIds).eq("override_type", "zero_points")
    : { data: [], error: null };
  if (overridesError) throw new Error(`Não foi possível carregar correções: ${overridesError.message}`);

  return buildOverallHistoryInput({
    players: (players || []).map((player: any) => ({
      id: player.id,
      playerProfile: player.player_profile,
      isGoalkeeper: Boolean(player.is_goalkeeper),
    })) satisfies OverallPlayer[],
    rounds: rounds || [],
    zeroPointOverrides: overrides || [],
  });
}

export type OverallShadowAdminData = {
  latestRun: {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
  } | null;
  snapshots: Array<{
    playerId: string;
    playerName: string;
    overall: number;
    def: number;
    alaMei: number;
    ata: number;
    gol: number;
    confidence: number;
    provisional: boolean;
    stale: boolean;
    roundsPlayed: number;
    goals: number;
    assists: number;
  }>;
};

export async function getOverallShadowAdminData(): Promise<OverallShadowAdminData | null> {
  const client = await getAdminClient();
  if (!client) return null;
  const database = client as any;
  const { data: latestRun, error: runError } = await database
    .from("overall_calculation_runs")
    .select("id, status, created_at, completed_at, error_message")
    .in("status", ["succeeded", "published", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw new Error(`Não foi possível carregar o modo sombra: ${runError.message}`);
  if (!latestRun) return { latestRun: null, snapshots: [] };

  const { data: rows, error: snapshotsError } = await database
    .from("player_overall_snapshots")
    .select("player_id, overall, def_overall, ala_mei_overall, ata_overall, gol_overall, confidence, rounds_played, is_provisional, is_stale, data_quality, player:player_id(name)")
    .eq("calculation_run_id", latestRun.id)
    .order("overall", { ascending: false });
  if (snapshotsError) throw new Error(`Não foi possível carregar os OVRs: ${snapshotsError.message}`);

  return {
    latestRun,
    snapshots: (rows || []).map((row: any) => ({
      playerId: row.player_id,
      playerName: row.player?.name || "Jogador",
      overall: numberValue(row.overall),
      def: numberValue(row.def_overall),
      alaMei: numberValue(row.ala_mei_overall),
      ata: numberValue(row.ata_overall),
      gol: numberValue(row.gol_overall),
      confidence: numberValue(row.confidence),
      provisional: Boolean(row.is_provisional),
      stale: Boolean(row.is_stale),
      roundsPlayed: numberValue(row.rounds_played),
      goals: numberValue(row.data_quality?.scout_totals?.goals),
      assists: numberValue(row.data_quality?.scout_totals?.assists),
    })),
  };
}

/** Gera um rascunho auditável. Nunca publica OVR, muda ranking ou altera sorteio. */
export async function recalculateOverallShadow() {
  const account = await getCurrentAccount();
  const client = await getAdminClient();
  if (!client || !account.user) return { success: false, error: "Somente administradores podem recalcular o OVR." };
  const database = client as any;
  let runId: string | null = null;

  try {
    const { data: formula, error: formulaError } = await database
      .from("overall_formula_versions")
      .select("id")
      .eq("key", FORMULA_KEY)
      .single();
    if (formulaError || !formula) throw new Error("A fórmula de OVR não foi encontrada. Confirme a migration 159.");

    const source = await loadOverallHistory(database);
    const latestRound = [...source.rounds].filter((round) => round.roundType === "official" && round.status === "finished").at(-1);
    const { data: run, error: runError } = await database
      .from("overall_calculation_runs")
      .insert({
        formula_version_id: formula.id,
        status: "processing",
        source_through_round_id: latestRound?.id || null,
        started_at: new Date().toISOString(),
        created_by: account.user.id,
      })
      .select("id")
      .single();
    if (runError || !run) throw new Error(runError?.message || "Não foi possível criar a execução de OVR.");
    runId = run.id;

    const calculation = calculatePlayerOveralls(source.players, source.rounds);
    const rows = calculation.snapshots.map((snapshot) => ({
      calculation_run_id: runId,
      player_id: snapshot.playerId,
      overall: snapshot.overall,
      def_overall: snapshot.positions.DEF.value,
      ala_mei_overall: snapshot.positions.ALA_MEI.value,
      ata_overall: snapshot.positions.ATA.value,
      gol_overall: snapshot.positions.GOL.value,
      confidence: Math.max(snapshot.positions.DEF.confidence, snapshot.positions.ALA_MEI.confidence, snapshot.positions.ATA.confidence),
      rounds_played: snapshot.roundsPlayed,
      goalkeeper_rounds: snapshot.goalkeeperRounds,
      is_provisional: snapshot.isProvisional,
      is_stale: snapshot.isStale,
      last_round_id: snapshot.lastRoundId,
      data_quality: {
        mode: "shadow",
        goal_timing: "elapsed_seconds_with_legacy_fallback",
        scoring_unit: "weekly_round",
        scout_totals: snapshot.scoutTotals,
      },
    }));
    if (rows.length) {
      const { error: snapshotError } = await database.from("player_overall_snapshots").insert(rows);
      if (snapshotError) throw new Error(`Não foi possível gravar os OVRs: ${snapshotError.message}`);
    }
    const { error: finishError } = await database
      .from("overall_calculation_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", runId);
    if (finishError) throw new Error(`OVRs calculados, mas a execução não foi concluída: ${finishError.message}`);

    revalidatePath("/admin/overall");
    return { success: true, runId, players: rows.length, rounds: source.rounds.length };
  } catch (error: any) {
    if (runId) {
      await database.from("overall_calculation_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error.message || "Erro desconhecido",
      }).eq("id", runId);
    }
    return { success: false, error: error.message || "Não foi possível calcular os OVRs." };
  }
}
