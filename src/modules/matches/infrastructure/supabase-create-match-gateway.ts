import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchLineupCommand = {
  player_id: string;
  team_id: string;
  original_team_id: string;
  participation_kind: "roster" | "replacement" | "structural";
  absent_player_id?: string | null;
};

export type CreateLiveMatchCommand = {
  roundId: string;
  teamAId: string;
  teamBId: string;
  goalkeeperAId: string;
  goalkeeperBId: string;
  goalkeeperARotationOrder: number | null;
  goalkeeperBRotationOrder: number | null;
  lineup: MatchLineupCommand[];
  idempotencyKey: string;
  clientStartedAt: string | null;
};

export type CreatedLiveMatchReceipt = {
  match_id: string;
  round_id: string;
  league_id: string;
  team_a_id: string;
  team_b_id: string;
  status: "live";
  match_order: number;
  duration_seconds: number;
  kickoff_at: string;
  idempotent: boolean;
};

export function supabaseCreateMatchGateway(client: SupabaseClient) {
  return {
    async create(command: CreateLiveMatchCommand): Promise<CreatedLiveMatchReceipt> {
      const { data, error } = await client.rpc("create_live_match", {
        p_round_id: command.roundId,
        p_team_a_id: command.teamAId,
        p_team_b_id: command.teamBId,
        p_goalkeeper_a_id: command.goalkeeperAId,
        p_goalkeeper_b_id: command.goalkeeperBId,
        p_goalkeeper_a_rotation_order: command.goalkeeperARotationOrder,
        p_goalkeeper_b_rotation_order: command.goalkeeperBRotationOrder,
        p_lineup: command.lineup,
        p_idempotency_key: command.idempotencyKey,
        p_client_started_at: command.clientStartedAt,
      });
      if (error) {
        const migrationMissing = error.code === "PGRST202"
          || /create_live_match/i.test(error.message || "") && /schema cache|function/i.test(error.message || "");
        if (migrationMissing) {
          throw new Error("Atualização 347 do banco pendente. A partida não foi iniciada.");
        }
        throw new Error(error.message);
      }
      if (!data || typeof data !== "object" || !("match_id" in data)) {
        throw new Error("O banco não devolveu o recibo da partida.");
      }
      return data as CreatedLiveMatchReceipt;
    },
  };
}
