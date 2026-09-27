import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { PrivateBalanceTag } from "@/lib/types";

export async function getPrivateBalanceTagsForDraw(playerIds: string[]) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  const result = new Map<string, PrivateBalanceTag>();
  if (!ids.length) return result;

  const service = createServiceClient();
  if (!service) throw new Error("A configuração segura das tags privadas não está disponível.");

  const { data, error } = await service
    .from("player_private_balance_tags")
    .select("player_id, balance_tag")
    .in("player_id", ids);
  if (error) throw new Error(`Não foi possível ler as tags privadas do sorteio: ${error.message}`);

  for (const row of data || []) result.set(row.player_id, row.balance_tag as PrivateBalanceTag);
  return result;
}
