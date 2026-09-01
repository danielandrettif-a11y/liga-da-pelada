"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "../auth";
import { supabase } from "../supabase";
import { DEFAULT_SCORING_POINTS } from "../scoring";
import type { ScoringPoints } from "../scoring";
import type { EventType } from "../types";

async function getAdminLeague() {
  const client = await getAdminClient();
  if (!client) return { client: null, league: null };

  const { data: activeLeague } = await client
    .from("leagues")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (activeLeague) return { client, league: activeLeague };

  const { data: fallbackLeague } = await client
    .from("leagues")
    .select("id")
    .limit(1)
    .maybeSingle();

  return { client, league: fallbackLeague };
}

export async function getGoalkeeperScoringPoints(leagueId: string) {
  const { data, error } = await supabase
    .from("ranking_rules")
    .select("points")
    .eq("league_id", leagueId)
    .eq("event_type", "best_goalkeeper")
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar pontuação de melhor goleiro:", error);
  }

  return data?.points ?? DEFAULT_SCORING_POINTS.best_goalkeeper;
}

export async function getActiveScoringRules(): Promise<ScoringPoints> {
  const rules = { ...DEFAULT_SCORING_POINTS };
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (leagueError || !league) {
    if (leagueError) console.error("Erro ao buscar liga para exibir a pontuação:", leagueError);
    return rules;
  }

  const { data, error } = await supabase
    .from("ranking_rules")
    .select("event_type, points")
    .eq("league_id", league.id);

  if (error) {
    console.error("Erro ao buscar regras públicas de pontuação:", error);
    return rules;
  }

  for (const rule of data || []) {
    if (rule.event_type in rules) rules[rule.event_type as EventType] = rule.points;
  }

  return rules;
}

export async function getScoringRules(): Promise<{
  success: boolean;
  rules: ScoringPoints;
  error?: string;
}> {
  const { client, league } = await getAdminLeague();

  if (!client) {
    return {
      success: false,
      rules: { ...DEFAULT_SCORING_POINTS },
      error: "Somente administradores podem acessar a pontuação.",
    };
  }

  if (!league) {
    return {
      success: false,
      rules: { ...DEFAULT_SCORING_POINTS },
      error: "Nenhuma liga encontrada.",
    };
  }

  const { data, error } = await client
    .from("ranking_rules")
    .select("event_type, points")
    .eq("league_id", league.id);

  if (error) {
    return {
      success: false,
      rules: { ...DEFAULT_SCORING_POINTS },
      error: error.message,
    };
  }

  const rules = { ...DEFAULT_SCORING_POINTS };
  for (const rule of data || []) {
    if (rule.event_type in rules) {
      rules[rule.event_type as EventType] = rule.points;
    }
  }

  return { success: true, rules };
}

export async function updateScoringRules(input: ScoringPoints) {
  try {
    const { client, league } = await getAdminLeague();
    if (!client) {
      return { success: false, error: "Somente administradores podem alterar a pontuação." };
    }
    if (!league) return { success: false, error: "Nenhuma liga encontrada." };

    const eventTypes = Object.keys(DEFAULT_SCORING_POINTS) as EventType[];
    const rules = eventTypes.map((eventType) => {
      const points = Number(input[eventType]);
      if (!Number.isInteger(points) || points < -100 || points > 100) {
        throw new Error(`A pontuação de ${eventType} deve ser um número inteiro entre -100 e 100.`);
      }

      return {
        league_id: league.id,
        event_type: eventType,
        points,
      };
    });

    const { error } = await client
      .from("ranking_rules")
      .upsert(rules, { onConflict: "league_id,event_type" });

    if (error) throw new Error(error.message);

    const { data: season } = await client
      .from("seasons")
      .select("id")
      .eq("league_id", league.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    let recalculationWarning: string | undefined;
    let recalculatedRounds = 0;

    if (season) {
      const { data: rounds, error: roundsError } = await client
        .from("rounds")
        .select("id")
        .eq("season_id", season.id);

      if (roundsError) {
        recalculationWarning = "Os pontos foram salvos, mas não foi possível localizar as rodadas para recalcular.";
      } else {
        const { calculateRoundStats } = await import("./stats");
        for (const round of rounds || []) {
          const result = await calculateRoundStats(round.id);
          if (result.success) recalculatedRounds += 1;
          else recalculationWarning = "Os pontos foram salvos, mas algumas rodadas não puderam ser recalculadas.";
        }
      }
    }

    revalidatePath("/admin/pontuacao");
    revalidatePath("/ranking");
    revalidatePath("/jogadores");
    revalidatePath("/");

    return {
      success: true,
      recalculatedRounds,
      warning: recalculationWarning,
    };
  } catch (error) {
    console.error("Erro ao atualizar pontuação:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao salvar a pontuação.",
    };
  }
}
