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
      const { data, error } = await client.from("callups")
        .insert({
          league_id: record.leagueId,
          date: record.date,
          start_time: record.startTime,
          stadium_id: record.stadiumId,
          stadium_name: record.stadiumName,
          stadium_map_url: record.stadiumMapUrl,
          round_type: record.roundType,
          status: "open",
          capacity: record.capacity,
          players_per_team: record.playersPerTeam,
          teams_per_round: record.teamsPerRound,
        })
        .select("id").single();
      if (error?.code === "23505") return { status: "duplicate" };
      if (error) return { status: "failed", error: error.message };
      return { status: "created", id: data.id };
    },
    async remove(callupId, leagueId) {
      const { error } = await client.from("callups")
        .delete().eq("id", callupId).eq("league_id", leagueId);
      return error?.message || null;
    },
  };
}
