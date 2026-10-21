import { describe, expect, it, vi } from "vitest";
import {
  MATCH_SETUP_ROUND_SELECT,
  readMatchSetupRound,
} from "./supabase-match-setup-reader";

function clientStub(data: unknown = null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnValue({ eq, maybeSingle });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, maybeSingle };
}

describe("read model da criação de partida", () => {
  it("limita a rodada à pelada selecionada e usa somente a projeção do fluxo", async () => {
    const client = clientStub({
      id: "round-1",
      teams: [{ id: "team-2", position: 2 }, { id: "team-1", position: 1 }],
      matches: [],
      round_players: [],
    });

    const result = await readMatchSetupRound(
      client as unknown as Parameters<typeof readMatchSetupRound>[0],
      { roundId: "round-1", leagueId: "league-1" },
    );

    expect(client.from).toHaveBeenCalledWith("rounds");
    expect(client.select).toHaveBeenCalledWith(MATCH_SETUP_ROUND_SELECT);
    expect(client.eq).toHaveBeenCalledWith("id", "round-1");
    expect(client.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(result?.teams.map((team: any) => team.id)).toEqual(["team-1", "team-2"]);

    const projection = MATCH_SETUP_ROUND_SELECT.replace(/\s+/g, " ");
    expect(projection).toContain("match_players");
    expect(projection).toContain("match_goalkeepers");
    expect(projection).not.toContain("match_events");
    expect(projection).not.toContain("players (*)");
    expect(projection).not.toContain(" *");
  });

  it("retorna nulo quando a rodada não pertence à pelada e propaga erro de leitura", async () => {
    const missingClient = clientStub();
    await expect(readMatchSetupRound(
      missingClient as unknown as Parameters<typeof readMatchSetupRound>[0],
      { roundId: "round-other", leagueId: "league-1" },
    )).resolves.toBeNull();

    const failingClient = clientStub(null, { message: "consulta inválida" });
    await expect(readMatchSetupRound(
      failingClient as unknown as Parameters<typeof readMatchSetupRound>[0],
      { roundId: "round-1", leagueId: "league-1" },
    )).rejects.toThrow("consulta inválida");
  });
});
