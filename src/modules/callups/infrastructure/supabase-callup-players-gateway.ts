import type { getCurrentAccount } from "@/lib/auth";
import { notifyCallupWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import type { CallupPlayersGateway } from "../application/manage-callup-players";

type AccountClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];

export function supabaseCallupPlayersGateway(client: AccountClient): CallupPlayersGateway {
  return {
    async addAsAdmin(callupId, playerId) {
      const { data, error } = await client.rpc("admin_add_callup_player", {
        p_callup_id: callupId,
        p_player_id: playerId,
      });
      return { status: data?.status as "confirmed" | "waitlist" | undefined, error: error?.message || null };
    },
    async addAsMember(callupId, playerId) {
      const { error } = await client.rpc("add_player_to_callup", {
        p_callup_id: callupId,
        p_player_id: playerId,
        p_admin_only: false,
      });
      return error?.message || null;
    },
    async removeAsAdmin(callupId, playerId) {
      const { error } = await client.rpc("admin_remove_callup_player", {
        p_callup_id: callupId,
        p_player_id: playerId,
      });
      return error?.message || null;
    },
    async notifyWithdrawal(callupId, playerId) {
      await notifyCallupWithdrawal(client, callupId, playerId);
    },
  };
}
