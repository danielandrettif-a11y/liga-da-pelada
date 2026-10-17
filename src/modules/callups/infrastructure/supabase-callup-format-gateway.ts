import type { getCurrentAccount } from "@/lib/auth";
import type { CallupFormatGateway } from "../application/change-callup-format";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupFormatGateway(client: AccountClient): CallupFormatGateway {
  return {
    async findOpenCallup(callupId, leagueId) {
      const { data, error } = await client
        .from("callups")
        .select("id")
        .eq("id", callupId)
        .eq("league_id", leagueId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async setFormat(format) {
      const { data, error } = await client.rpc("set_callup_format", {
        p_callup_id: format.callupId,
        p_players_per_team: format.playersPerTeam,
        p_teams_per_round: format.teamsPerRound,
      });
      if (error) throw new Error(error.message);
      return {
        fantasySizePreserved: Boolean(data?.[0]?.fantasy_size_preserved),
        fantasyLineupSize: Number(data?.[0]?.fantasy_lineup_size || format.playersPerTeam),
      };
    },
  };
}
