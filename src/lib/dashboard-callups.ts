import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCallupClosingMatch, isFinishedCallupRound } from "./callup-lifecycle";

// O read model legado não inclui convocações convertidas pelo sorteio.
// Leia a lista atual diretamente até que o read model também suporte esse estado.
export async function readDashboardCallups(client: SupabaseClient, leagueId: string) {
  return client.from("callups")
    .select("id, date, start_time, stadium_id, stadium_name, stadium_map_url, round_type, capacity, waitlist_capacity, callup_entries(player_id, status, position), round:round_id(id, status, matches(status, started_at))")
    .eq("league_id", leagueId)
    .in("status", ["open", "locked", "converted"])
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
}

export function isDashboardCallupVisible(callup: { round?: { status?: string | null; matches?: Array<{ status?: string | null; started_at?: string | null }> | null } | null }) {
  return !isFinishedCallupRound(callup.round) && !hasCallupClosingMatch(callup.round?.matches);
}
