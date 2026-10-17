import type { getCurrentAccount } from "@/lib/auth";
import type { CallupEditingGateway, EditedCallupRecord } from "../application/edit-callup";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

function callupUpdate(record: EditedCallupRecord) {
  return {
    date: record.date,
    start_time: record.startTime,
    stadium_id: record.stadiumId,
    stadium_name: record.stadiumName,
    stadium_map_url: record.stadiumMapUrl,
    round_type: record.roundType,
    updated_at: new Date().toISOString(),
  };
}

export function supabaseCallupEditingGateway(client: AccountClient): CallupEditingGateway {
  return {
    async existsOnDate(leagueId, date, excludedCallupId) {
      const { data, error } = await client.from("callups").select("id")
        .eq("league_id", leagueId).eq("date", date)
        .in("status", ["open", "locked", "converted"])
        .neq("id", excludedCallupId).limit(1);
      if (error) throw new Error(error.message);
      return Boolean(data?.length);
    },
    async loadStadium(stadiumId, leagueId) {
      const { data } = await client.from("stadiums")
        .select("name, google_maps_url")
        .eq("id", stadiumId).eq("league_id", leagueId).maybeSingle();
      return data ? { name: data.name, mapUrl: data.google_maps_url } : null;
    },
    async loadLeagueVenue(leagueId) {
      const { data } = await client.from("leagues")
        .select("stadium_name, stadium_map_url")
        .eq("id", leagueId).single();
      return { name: data?.stadium_name || null, mapUrl: data?.stadium_map_url || null };
    },
    async updateCallup(record) {
      const { error } = await client.from("callups")
        .update(callupUpdate(record))
        .eq("id", record.callupId).eq("league_id", record.leagueId);
      return error ? { code: error.code, message: error.message } : null;
    },
    async loadLinkedRoundId(callupId, leagueId) {
      const { data } = await client.from("callups")
        .select("round_id")
        .eq("id", callupId).eq("league_id", leagueId).maybeSingle();
      return data?.round_id || null;
    },
    async syncDraftRound(roundId, record) {
      await client.from("rounds")
        .update(callupUpdate(record))
        .eq("id", roundId).eq("league_id", record.leagueId).eq("status", "draft");
    },
  };
}
