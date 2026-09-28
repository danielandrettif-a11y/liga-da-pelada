import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { PrivateBalanceTag } from "@/lib/types";

export async function getPrivateBalanceTagsForDraw(playerIds: string[], authenticatedClient?: any) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  const result = new Map<string, PrivateBalanceTag>();
  if (!ids.length) return result;

  const client = createServiceClient() || authenticatedClient;
  if (!client) return result;

  const { data, error } = await client
    .from("player_private_balance_tags")
    .select("player_id, balance_tag")
    .in("player_id", ids);
  if (error) {
    console.error("Não foi possível ler as tags privadas; o sorteio seguirá sem elas:", error.message);
    return result;
  }

  for (const row of data || []) result.set(row.player_id, row.balance_tag as PrivateBalanceTag);
  return result;
}
