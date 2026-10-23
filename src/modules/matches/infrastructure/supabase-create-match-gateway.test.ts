import { describe, expect, it, vi } from "vitest";
import { supabaseCreateMatchGateway } from "./supabase-create-match-gateway";

const command = {
  roundId: "round-1",
  teamAId: "team-a",
  teamBId: "team-b",
  goalkeeperAId: "player-a",
  goalkeeperBId: "player-b",
  goalkeeperARotationOrder: 1,
  goalkeeperBRotationOrder: null,
  lineup: [{
    player_id: "player-a",
    team_id: "team-a",
    original_team_id: "team-a",
    participation_kind: "roster" as const,
    absent_player_id: null,
  }],
  idempotencyKey: "match-request-1",
  clientStartedAt: "2026-10-21T12:00:00.000Z",
};

describe("gateway de abertura de partida", () => {
  it("envia toda a criação para uma única RPC transacional", async () => {
    const receipt = {
      match_id: "match-1", round_id: "round-1", league_id: "league-1",
      team_a_id: "team-a", team_b_id: "team-b", status: "live" as const,
      match_order: 2, duration_seconds: 420, kickoff_at: "2026-10-21T12:00:00Z",
      idempotent: false,
    };
    const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
    const gateway = supabaseCreateMatchGateway({ rpc } as unknown as Parameters<typeof supabaseCreateMatchGateway>[0]);

    await expect(gateway.create(command)).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_live_match", {
      p_round_id: "round-1",
      p_team_a_id: "team-a",
      p_team_b_id: "team-b",
      p_goalkeeper_a_id: "player-a",
      p_goalkeeper_b_id: "player-b",
      p_goalkeeper_a_rotation_order: 1,
      p_goalkeeper_b_rotation_order: null,
      p_lineup: command.lineup,
      p_idempotency_key: "match-request-1",
      p_client_started_at: "2026-10-21T12:00:00.000Z",
    });
  });

  it("falha fechado quando a migration ainda não está disponível", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find function create_live_match in schema cache" },
    });
    const gateway = supabaseCreateMatchGateway({ rpc } as unknown as Parameters<typeof supabaseCreateMatchGateway>[0]);

    await expect(gateway.create(command)).rejects.toThrow("Atualização 347 do banco pendente");
  });

  it("rejeita resposta sem recibo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const gateway = supabaseCreateMatchGateway({ rpc } as unknown as Parameters<typeof supabaseCreateMatchGateway>[0]);
    await expect(gateway.create(command)).rejects.toThrow("não devolveu o recibo");
  });
});
