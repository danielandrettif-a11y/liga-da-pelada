import type { getCurrentAccount } from "@/lib/auth";
import type { CallupManagementGateway } from "../application/manage-callup";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupManagementGateway(client: AccountClient): CallupManagementGateway {
  return {
    async close(callupId, leagueId) {
      const { error } = await client.from("callups")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", callupId).eq("league_id", leagueId);
      return error?.message || null;
    },
    async setVisibility(callupId, leagueId, isPublic) {
      const { error } = await client.from("callups")
        .update({ is_public: isPublic, updated_at: new Date().toISOString() })
        .eq("id", callupId).eq("league_id", leagueId);
      return error?.message || null;
    },
    async loadCapacity(callupId, leagueId) {
      const { data, error } = await client.from("callups")
        .select("capacity").eq("id", callupId).eq("league_id", leagueId).single();
      return { capacity: data?.capacity ?? null, error: error?.message || null };
    },
    async countConfirmed(callupId) {
      const { data, error } = await client.from("callup_entries")
        .select("id").eq("callup_id", callupId).eq("status", "confirmed");
      return { count: data?.length || 0, error: error?.message || null };
    },
    async lock(callupId, leagueId) {
      const { error } = await client.from("callups")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", callupId).eq("league_id", leagueId).eq("status", "open");
      return error?.message || null;
    },
  };
}
