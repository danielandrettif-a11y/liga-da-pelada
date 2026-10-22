import type { getCurrentAccount } from "@/lib/auth";
import type { CallupOpeningGateway } from "../application/open-callup";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupOpeningGateway(client: AccountClient): CallupOpeningGateway {
  return {
    async existsOnDate(leagueId, date) {
      const { data, error } = await client.from("callups").select("id")
        .eq("league_id", leagueId).eq("date", date)
        .in("status", ["open", "locked", "converted"])
        .limit(1);
      if (error) throw new Error(error.message);
      return Boolean(data?.length);
    },
    async loadLeagueDefaults(leagueId) {
      const { data, error } = await client.from("leagues")
        .select("players_per_team, teams_per_round, stadium_name, stadium_map_url")
        .eq("id", leagueId).single();
      if (error) throw new Error(error.message);
      return {
        playersPerTeam: data?.players_per_team ?? null,
        teamsPerRound: data?.teams_per_round ?? null,
        stadiumName: data?.stadium_name || null,
        stadiumMapUrl: data?.stadium_map_url || null,
      };
    },
    async loadStadium(stadiumId, leagueId) {
      const { data } = await client.from("stadiums")
        .select("name, google_maps_url")
        .eq("id", stadiumId).eq("league_id", leagueId).maybeSingle();
      return data ? { name: data.name, mapUrl: data.google_maps_url } : null;
    },
    async insert(record) {
      const { data, error } = await client.rpc("create_league_callup", {
        p_league_id: record.leagueId,
        p_date: record.date,
        p_start_time: record.startTime,
        p_stadium_id: record.stadiumId,
        p_stadium_name: record.stadiumName,
        p_stadium_map_url: record.stadiumMapUrl,
        p_round_type: record.roundType,
        p_capacity: record.capacity,
        p_players_per_team: record.playersPerTeam,
        p_teams_per_round: record.teamsPerRound,
      });
      if (error?.code === "23505") return { status: "duplicate" };
      if (error) return { status: "failed", error: error.message };
      return { status: "created", id: String(data) };
    },
    async remove(callupId, leagueId) {
      const { error } = await client.from("callups")
        .delete().eq("id", callupId).eq("league_id", leagueId);
      return error?.message || null;
    },
  };
}
