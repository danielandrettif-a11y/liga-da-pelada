"use server";

/**
 * Mantido apenas para compatibilidade com links antigos. O prêmio manual foi
 * removido: goleiros pontuam pelas partidas efetivamente jogadas no gol.
 */
export async function selectBestGoalkeeper(_roundId: string, _playerId: string) {
  return {
    success: false,
    error: "O prêmio de melhor goleiro foi removido. A pontuação agora vem das atuações reais no gol.",
  };
}
