import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

const readCachedMarketModel = unstable_cache(
  async (fantasySeasonId: string, version: string) => {
    const service = createServiceClient();
    if (!service) return { data: null, error: "service-client-unavailable", version };
    const { data, error } = await service.rpc("get_fantasy_market_cache_source", {
      p_fantasy_season_id: fantasySeasonId,
    });
    return { data, error: error?.message || null, version };
  },
  ["fantasy-market-read-model-v1"],
  { revalidate: 300, tags: ["fantasy-market"] },
);

/**
 * O chamador autentica e valida a pelada antes de chegar aqui. A versao vem
 * de uma consulta RLS leve; quando preco ou scouts mudam, a chave muda e o
 * cache antigo deixa de ser reutilizado imediatamente.
 */
export async function getCachedFantasyMarketReadModel(
  fantasySeasonId: string,
  version: string,
) {
  return readCachedMarketModel(fantasySeasonId, version);
}
