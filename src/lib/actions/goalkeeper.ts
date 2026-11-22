"use server";

import { matchApiFor } from "@/modules/matches/infrastructure/match-api-session";
import { getSelectedLeague } from "../league-context";

/**
 * Mantido apenas para compatibilidade com links antigos. O prêmio manual foi
 * removido: goleiros pontuam pelas partidas efetivamente jogadas no gol.
 */
export async function selectBestGoalkeeper(roundId: string, playerId: string) {
  try {
    const api = await matchApiFor();
    if (api) {
      const league = await getSelectedLeague();
      if (league) {
        return await api.selectBestGoalkeeper(league.id, roundId, playerId);
      }
    }
  } catch (error) {
    console.error("Erro ao chamar API de melhor goleiro:", error);
  }

  return {
    success: false,
    error: "O prêmio de melhor goleiro foi removido. A pontuação agora vem das atuações reais no gol.",
  };
}
