import type { getCurrentAccount } from "@/lib/auth";
import type { PrelistGateway } from "../application/prepare-callup-prelist";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupPrelistGateway(client: AccountClient): PrelistGateway {
  return {
    async loadCallup(callupId, leagueId) {
      const { data, error } = await client.from("callups")
        .select("id, date, start_time, stadium_id, stadium_name, stadium_map_url, round_type, status, round_id, callup_entries(player_id, status)")
        .eq("id", callupId).eq("league_id", leagueId).maybeSingle();
      return {
        callup: data ? {
          id: data.id,
          date: data.date,
          startTime: data.start_time,
          stadiumId: data.stadium_id,
          stadiumName: data.stadium_name,
          stadiumMapUrl: data.stadium_map_url,
          roundType: data.round_type,
          status: data.status,
          roundId: data.round_id,
          entries: (data.callup_entries || []).map((entry) => ({ playerId: entry.player_id, status: entry.status })),
        } : null,
        error: error?.message || null,
      };
    },
    async loadLinkedRound(roundId) {
      const { data, error } = await client.from("rounds")
        .select("id, status, preparation_stage").eq("id", roundId).maybeSingle();
      return {
        round: data ? { id: data.id, status: data.status, preparationStage: data.preparation_stage } : null,
        error: error?.message || null,
      };
    },
    async save({ leagueId, callup, confirmedPlayerIds }) {
      const { data, error } = await client.rpc("save_round_prelist", {
        p_league_id: leagueId,
        p_round_id: null,
        p_date: callup.date,
        p_start_time: callup.startTime || "08:00",
        p_round_type: callup.roundType === "friendly" ? "friendly" : "official",
        p_player_ids: confirmedPlayerIds,
        p_callup_id: callup.id,
        p_stadium_id: callup.stadiumId || null,
        p_stadium_name: callup.stadiumName || null,
        p_stadium_map_url: callup.stadiumMapUrl || null,
      });
      return { roundId: data, error: error?.message || null };
    },
  };
}
