import type { getCurrentAccount } from "@/lib/auth";
import { notifyCartolaLineupsAboutWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import type { CallupGuestGateway } from "../application/manage-callup-guests";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupGuestsGateway(client: AccountClient): CallupGuestGateway {
  return {
    async createGuest(input) {
      // O RPC cria o perfil, vínculo com a pelada e entrada na lista na mesma transação.
      const { data, error } = await (client as any).rpc("create_callup_guest", {
        p_callup_id: input.callupId,
        p_name: input.name,
        p_player_profile: input.playerProfile,
        p_is_goalkeeper: input.isGoalkeeper,
      });
      const entry = Array.isArray(data) ? data[0] : data;
      return { status: entry?.status, playerId: entry?.player_id, error: error?.message || null };
    },
    async loadCallup(callupId, leagueId) {
      const { data, error } = await client.from("callups")
        .select("status, round_id")
        .eq("id", callupId).eq("league_id", leagueId).maybeSingle();
      return {
        callup: data ? { status: data.status, roundId: data.round_id } : null,
        error: error?.message || null,
      };
    },
    async loadEntry(callupId, playerId) {
      const { data, error } = await client.from("callup_entries")
        .select("id, joined_by, player_id, player:players(created_by_user_id)")
        .eq("callup_id", callupId).eq("player_id", playerId).maybeSingle();
      const player = data?.player as { created_by_user_id?: string | null } | null | undefined;
      return {
        entry: data ? { joinedBy: data.joined_by, createdByUserId: player?.created_by_user_id || null } : null,
        error: error?.message || null,
      };
    },
    async deleteEntry(callupId, playerId) {
      const { error } = await client.from("callup_entries")
        .delete().eq("callup_id", callupId).eq("player_id", playerId);
      return error?.message || null;
    },
    async notifyWithdrawal(callupId, playerId) {
      await notifyCartolaLineupsAboutWithdrawal(client, callupId, playerId);
    },
    async normalizePositions(callupId) {
      await client.rpc("normalize_callup_positions", { p_callup_id: callupId });
    },
  };
}
