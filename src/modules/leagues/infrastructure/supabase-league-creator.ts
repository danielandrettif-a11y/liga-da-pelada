import type { getCurrentAccount } from "@/lib/auth";
import { DuplicateLeagueNameError, type LeagueCreator } from "../application/create-league";
import { isDuplicateLeagueNameError } from "../domain/league-name";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseLeagueCreator(client: AccountClient): LeagueCreator {
  return {
    async create(league) {
      const { data, error } = await client.rpc("create_league_for_user", {
        p_name: league.name,
        p_tier: league.tier,
        p_visibility: league.visibility,
      });
      if (isDuplicateLeagueNameError(error)) throw new DuplicateLeagueNameError();
      if (error) throw new Error(error.message);
      return data ? String(data) : null;
    },
  };
}
