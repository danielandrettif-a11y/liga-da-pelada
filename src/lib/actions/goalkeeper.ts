"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "../auth";

export async function selectBestGoalkeeper(roundId: string, playerId: string) {
  try {
    const client = await getAdminClient();
    if (!client) {
      return { success: false, error: "Somente administradores podem escolher o melhor goleiro." };
    }

    const { data: round, error: roundError } = await client
      .from("rounds")
      .select("id, status")
      .eq("id", roundId)
      .maybeSingle();

    if (roundError || !round) return { success: false, error: "Rodada não encontrada." };
    if (round.status !== "finished") {
      return { success: false, error: "Finalize a rodada antes de escolher o melhor goleiro." };
    }

    const { data: participant, error: participantError } = await client
      .from("round_players")
      .select("player_id")
      .eq("round_id", roundId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (participantError || !participant) {
      return { success: false, error: "Escolha um jogador que participou desta rodada." };
    }

    const { error: updateError } = await client
      .from("rounds")
      .update({ best_goalkeeper_player_id: playerId })
      .eq("id", roundId);

    if (updateError) throw new Error(updateError.message);

    const { calculateRoundStats } = await import("./stats");
    const recalculation = await calculateRoundStats(roundId);
    if (!recalculation.success) {
      return {
        success: false,
        error: `O goleiro foi escolhido, mas os pontos não foram recalculados: ${recalculation.error || "erro desconhecido"}`,
      };
    }

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath("/ranking");
    revalidatePath("/jogadores");
    revalidatePath(`/jogadores/${playerId}`);
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Erro ao escolher melhor goleiro:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Não foi possível escolher o melhor goleiro.",
    };
  }
}
