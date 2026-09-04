"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import type { PlayerAdminAttributes } from "../types";

export async function getPlayerSpeedRatings(): Promise<Record<string, 1 | 2 | 3 | null>> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return {};

  const { data, error } = await account.client
    .from("player_admin_attributes")
    .select("player_id, speed_rating");

  if (error) {
    console.error("Erro ao buscar atributos de velocidade:", error);
    return {};
  }

  const result: Record<string, 1 | 2 | 3 | null> = {};
  for (const item of data || []) {
    result[item.player_id] = item.speed_rating;
  }
  return result;
}

export async function setPlayerSpeedRating(
  playerId: string,
  speedRating: 1 | 2 | 3 | null,
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Apenas administradores podem definir atributos de velocidade." };
  }

  if (speedRating !== null && ![1, 2, 3].includes(speedRating)) {
    return { success: false, error: "Avaliação de velocidade inválida (deve ser 1, 2 ou 3 estrelas)." };
  }

  const { error } = await account.client
    .from("player_admin_attributes")
    .upsert(
      {
        player_id: playerId,
        speed_rating: speedRating,
        updated_by: account.user?.id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id" },
    );

  if (error) {
    console.error("Erro ao salvar velocidade do jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath("/admin/jogadores");
  return { success: true };
}
