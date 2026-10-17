import type { getCurrentAccount } from "@/lib/auth";
import type { LeagueCreator } from "../application/create-league";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseLeagueCreator(client: AccountClient): LeagueCreator {
  return {
    async create(league) {
      const { data, error } = await client.rpc("create_league_for_user", {
        p_name: league.name,
        p_tier: league.tier,
        p_visibility: league.visibility,
      });
      if (error) throw new Error(error.message);
      return data ? String(data) : null;
    },
  };
}
