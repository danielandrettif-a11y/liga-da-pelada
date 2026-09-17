"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import { calculatePlayerOveralls, parseOverallFormulaConfig, type OverallPlayer, type OverallRole } from "../overall";
import { buildOverallHistoryInput } from "../overall-history";

const FORMULA_KEY = "adaptive-v8-soft-progression-shadow";
const COMPARISON_FORMULA_KEY = "adaptive-v7-trait-composed-shadow";

function numberValue(value: unknown) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

async function loadOverallHistory(client: any) {
  const { data: league, error: leagueError } = await client.from("leagues").select("id").eq("is_active", true).limit(1).single();
  if (leagueError || !league) throw new Error("Não existe uma liga ativa para calcular o OVR.");

  const [{ data: members, error: membersError }, { data: rounds, error: roundsError }] = await Promise.all([
    client.from("league_members")
      .select("players!inner(id, name, player_profile, overall_traits, overall_seed_mode, is_goalkeeper, is_selectable, member_category)")
      .eq("league_id", league.id).eq("is_active", true),
    client.from("rounds").select(`
      id, number, date, created_at, round_type, status,
      player_round_stats (player_id, player_profile_locked, goals, assists, own_goals),
      matches (
        id, status, team_a_id, team_b_id, score_a, score_b,
        duration_seconds, timer_accumulated_seconds, eligibility_elapsed_offset_seconds,
        match_events (player_id, assist_player_id, team_id, is_own_goal, elapsed_seconds, minute),
        match_players (player_id, team_id, entered_elapsed_seconds, left_elapsed_seconds),
        match_goalkeepers (player_id, team_id)
      )
    `).eq("league_id", league.id).eq("round_type", "official").eq("status", "finished")
      .order("date", { ascending: true }).order("created_at", { ascending: true }),
  ]);
  if (membersError) throw new Error(`Não foi possível carregar os membros da liga: ${membersError.message}`);
  if (roundsError) throw new Error(`Não foi possível carregar o histórico: ${roundsError.message}`);

  const officialPlayers: Array<OverallPlayer & { name: string }> = (members || [])
    .map((member: any) => Array.isArray(member.players) ? member.players[0] : member.players)
    .filter((player: any) => player?.is_selectable && player.member_category === "player")
    .map((player: any) => ({ id: player.id, name: player.name || "Jogador", playerProfile: player.player_profile, overallTraits: Array.isArray(player.overall_traits) ? player.overall_traits : [], overallSeedMode: player.overall_seed_mode, isGoalkeeper: Boolean(player.is_goalkeeper) }));
  // Sem características, o atleta fica pendente para o ADM e não recebe uma
  // nota v5 por inferência da antiga posição do Cartola.
  const pendingPlayers = officialPlayers.filter((player) => (player.overallTraits || []).length === 0).map(({ id, name }) => ({ id, name }));
  const players = officialPlayers.filter((player) => (player.overallTraits || []).length > 0).map(({ name: _name, ...player }) => player) satisfies OverallPlayer[];
  const roundIds = (rounds || []).map((round: any) => round.id);
  const { data: overrides, error: overridesError } = roundIds.length
    ? await client.from("player_round_stat_overrides").select("round_id, player_id").in("round_id", roundIds).eq("override_type", "zero_points")
    : { data: [], error: null };
  if (overridesError) throw new Error(`Não foi possível carregar correções: ${overridesError.message}`);
  return { ...buildOverallHistoryInput({ players, rounds: rounds || [], zeroPointOverrides: overrides || [] }), pendingPlayers };
}

type PositionMap = Record<OverallRole, number>;
type RecentRound = { date: string; goals: number; assists: number; goalsConceded: number; attackingScore: number; defensiveScore: number; timingQuality: "exact" | "fallback"; playedProfile: string | null; traitEvidence: PositionMap; positions: PositionMap };

export type OverallShadowAdminData = {
  latestRun: { id: string; status: string; created_at: string; completed_at: string | null; error_message: string | null; formulaLabel: string } | null;
  pendingPlayers: Array<{ id: string; name: string }>;
  snapshots: Array<{
    playerId: string; playerName: string; overall: number; def: number; alaMei: number; ata: number; gol: number; confidence: number;
    positionConfidence: PositionMap; provisional: boolean; stale: boolean; roundsPlayed: number; goals: number; assists: number;
    seedMode: "legacy_tag" | "observed"; recentRounds: RecentRound[];
    comparison: { overallDelta: number; defDelta: number; alaMeiDelta: number; ataDelta: number; golDelta: number } | null;
  }>;
};

export async function getOverallShadowAdminData(): Promise<OverallShadowAdminData | null> {
  const client = await getAdminClient();
  if (!client) return null;
  const database = client as any;
  const { data: formula, error: formulaError } = await database.from("overall_formula_versions").select("id, label").eq("key", FORMULA_KEY).maybeSingle();
  if (formulaError) throw new Error(`Não foi possível carregar a fórmula: ${formulaError.message}`);
  if (!formula) return { latestRun: null, snapshots: [], pendingPlayers: [] };
  const source = await loadOverallHistory(database);
  const { data: latestRun, error: runError } = await database.from("overall_calculation_runs")
    .select("id, status, created_at, completed_at, error_message").eq("formula_version_id", formula.id)
    .in("status", ["succeeded", "published", "failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (runError) throw new Error(`Não foi possível carregar o modo sombra: ${runError.message}`);
  if (!latestRun) return { latestRun: null, snapshots: [], pendingPlayers: source.pendingPlayers };
  const { data: comparisonFormula } = await database
    .from("overall_formula_versions")
    .select("id")
    .eq("key", COMPARISON_FORMULA_KEY)
    .maybeSingle();
  const { data: comparisonRun } = comparisonFormula
    ? await database.from("overall_calculation_runs").select("id")
      .eq("formula_version_id", comparisonFormula.id).in("status", ["succeeded", "published"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const [{ data: rows, error: snapshotsError }, { data: breakdownRows, error: breakdownError }, { data: comparisonRows }] = await Promise.all([
    database.from("player_overall_snapshots").select("player_id, overall, def_overall, ala_mei_overall, ata_overall, gol_overall, confidence, rounds_played, is_provisional, is_stale, data_quality, player:player_id(name)").eq("calculation_run_id", latestRun.id).order("overall", { ascending: false }),
    database.from("player_overall_round_breakdowns").select("player_id, round_date, round_index, goals, assists, goals_conceded, attacking_score, defensive_score, timing_quality, played_profile, trait_evidence, positions").eq("calculation_run_id", latestRun.id).order("round_index", { ascending: false }),
    comparisonRun
      ? database.from("player_overall_snapshots").select("player_id, overall, def_overall, ala_mei_overall, ata_overall, gol_overall").eq("calculation_run_id", comparisonRun.id)
      : Promise.resolve({ data: [] }),
  ]);
  if (snapshotsError) throw new Error(`Não foi possível carregar os OVRs: ${snapshotsError.message}`);
  if (breakdownError) throw new Error(`Não foi possível carregar a explicação dos OVRs: ${breakdownError.message}`);
  const roundsByPlayer = new Map<string, any[]>();
  for (const row of breakdownRows || []) {
    const current = roundsByPlayer.get(row.player_id) || [];
    if (current.length < 8) current.push(row);
    roundsByPlayer.set(row.player_id, current);
  }
  const comparisonByPlayer = new Map((comparisonRows || []).map((row: any) => [row.player_id, row]));
  return {
    latestRun: { ...latestRun, formulaLabel: formula.label },
    pendingPlayers: source.pendingPlayers,
    snapshots: (rows || []).map((row: any) => ({
      playerId: row.player_id, playerName: row.player?.name || "Jogador", overall: numberValue(row.overall), def: numberValue(row.def_overall), alaMei: numberValue(row.ala_mei_overall), ata: numberValue(row.ata_overall), gol: numberValue(row.gol_overall), confidence: numberValue(row.confidence),
      positionConfidence: row.data_quality?.position_confidence || { DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 }, provisional: Boolean(row.is_provisional), stale: Boolean(row.is_stale), roundsPlayed: numberValue(row.rounds_played), goals: numberValue(row.data_quality?.scout_totals?.goals), assists: numberValue(row.data_quality?.scout_totals?.assists), seedMode: row.data_quality?.seed_mode === "legacy_tag" ? "legacy_tag" : "observed",
      recentRounds: (roundsByPlayer.get(row.player_id) || []).map((item) => ({ date: item.round_date, goals: numberValue(item.goals), assists: numberValue(item.assists), goalsConceded: numberValue(item.goals_conceded), attackingScore: numberValue(item.attacking_score), defensiveScore: numberValue(item.defensive_score), timingQuality: item.timing_quality === "exact" ? "exact" : "fallback", playedProfile: item.played_profile || null, traitEvidence: item.trait_evidence || { DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 }, positions: item.positions || { DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 } })),
      comparison: (() => {
        const previous = comparisonByPlayer.get(row.player_id) as any;
        return previous ? {
          overallDelta: numberValue(row.overall) - numberValue(previous.overall),
          defDelta: numberValue(row.def_overall) - numberValue(previous.def_overall),
          alaMeiDelta: numberValue(row.ala_mei_overall) - numberValue(previous.ala_mei_overall),
          ataDelta: numberValue(row.ata_overall) - numberValue(previous.ata_overall),
          golDelta: numberValue(row.gol_overall) - numberValue(previous.gol_overall),
        } : null;
      })(),
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
    const { data: formula, error: formulaError } = await database.from("overall_formula_versions").select("id, config").eq("key", FORMULA_KEY).single();
    if (formulaError || !formula) throw new Error("A fórmula v8 não foi encontrada. Confirme a migration 168.");
    const source = await loadOverallHistory(database);
    const latestRound = [...source.rounds].filter((round) => round.roundType === "official" && round.status === "finished").at(-1);
    const { data: run, error: runError } = await database.from("overall_calculation_runs").insert({ formula_version_id: formula.id, status: "processing", source_through_round_id: latestRound?.id || null, started_at: new Date().toISOString(), created_by: account.user.id }).select("id").single();
    if (runError || !run) throw new Error(runError?.code === "23505" ? "Já existe um cálculo de OVR em andamento. Aguarde ele terminar." : runError?.message || "Não foi possível criar a execução de OVR.");
    runId = run.id;
    const calculation = calculatePlayerOveralls(source.players, source.rounds, parseOverallFormulaConfig(formula.config));
    const rows = calculation.snapshots.map((snapshot) => ({
      calculation_run_id: runId, player_id: snapshot.playerId, overall: snapshot.overall, def_overall: snapshot.positions.DEF.value, ala_mei_overall: snapshot.positions.ALA_MEI.value, ata_overall: snapshot.positions.ATA.value, gol_overall: snapshot.positions.GOL.value,
      confidence: Math.max(snapshot.positions.DEF.confidence, snapshot.positions.ALA_MEI.confidence, snapshot.positions.ATA.confidence), rounds_played: snapshot.roundsPlayed, goalkeeper_rounds: snapshot.goalkeeperRounds, is_provisional: snapshot.isProvisional, is_stale: snapshot.isStale, last_round_id: snapshot.lastRoundId,
      data_quality: { mode: "shadow", goal_timing: "first_conceded_goal_with_legacy_fallback", scoring_unit: "weekly_round", characteristics: "admin_weighted", seed_mode: "disabled_in_v5", scout_totals: snapshot.scoutTotals, position_confidence: Object.fromEntries(Object.entries(snapshot.positions).map(([role, position]) => [role, position.confidence])) },
    }));
    if (rows.length) {
      const { error } = await database.from("player_overall_snapshots").insert(rows);
      if (error) throw new Error(`Não foi possível gravar os OVRs: ${error.message}`);
    }
    if (calculation.breakdowns.length) {
      const { error } = await database.from("player_overall_round_breakdowns").insert(calculation.breakdowns.map((item) => ({ calculation_run_id: runId, player_id: item.playerId, round_id: item.roundId, round_date: item.roundDate, round_index: item.roundIndex, goals: item.goals, assists: item.assists, own_goals: item.ownGoals, goals_conceded: item.goalsConceded, attacking_score: item.attackingScore, defensive_score: item.defensiveScore, timing_quality: item.timingQuality, played_profile: item.playedProfile, role_evidence: item.roleEvidence, trait_evidence: item.traitEvidence, positions: item.positions, position_confidence: item.confidence })));
      if (error) throw new Error(`Não foi possível gravar a auditoria das rodadas: ${error.message}`);
    }
    const { error: finishError } = await database.from("overall_calculation_runs").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", runId);
    if (finishError) throw new Error(`OVRs calculados, mas a execução não foi concluída: ${finishError.message}`);
    revalidatePath("/admin/overall");
    return { success: true, runId, players: rows.length, pendingPlayers: source.pendingPlayers.length, rounds: source.rounds.length };
  } catch (error: any) {
    if (runId) await database.from("overall_calculation_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: error.message || "Erro desconhecido" }).eq("id", runId);
    return { success: false, error: error.message || "Não foi possível calcular os OVRs." };
  }
}
