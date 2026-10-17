import type { getCurrentAccount } from "@/lib/auth";
import { notifyCartolaLineupsAboutWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import type { CallupParticipationGateway } from "../application/participate-in-callup";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupParticipationGateway(client: AccountClient): CallupParticipationGateway {
  return {
    async ensurePlayerAccount() {
      const { error } = await client.rpc("ensure_my_player_account");
      return error?.message || null;
    },
    async join(callupId) {
      const { data, error } = await client.rpc("join_callup", { p_callup_id: callupId });
      return { status: (data as { status?: "confirmed" | "waitlist" } | null)?.status, error: error?.message || null };
    },
    async loadRoundId(callupId, leagueId) {
      const { data } = await client.from("callups")
        .select("round_id").eq("id", callupId).eq("league_id", leagueId).maybeSingle();
      return data?.round_id || null;
    },
    async leave(callupId) {
      const { error } = await client.rpc("leave_callup", { p_callup_id: callupId });
      return error?.message || null;
    },
    async loadPlayerId(userId) {
      const { data } = await client.from("account_profiles")
        .select("player_id").eq("user_id", userId).maybeSingle();
      return data?.player_id || null;
    },
    async notifyWithdrawal(callupId, playerId) {
      await notifyCartolaLineupsAboutWithdrawal(client, callupId, playerId);
    },
  };
}
