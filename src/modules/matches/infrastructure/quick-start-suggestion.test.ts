import { describe, expect, it, vi } from "vitest";
import { suggestNextMatchRotation } from "@/lib/next-match";
import { buildQuickStartSuggestion } from "./quick-start-suggestion";

vi.mock("@/lib/next-match", () => ({
  suggestNextMatchRotation: vi.fn().mockReturnValue({ teamAId: "team-1", teamBId: "team-3" }),
}));

function client(round: Record<string, unknown> | null, error: { message: string } | null = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: round, error }),
  };
  return { from: vi.fn(() => query), query };
}

describe("sugestão de próxima partida", () => {
  it("ordena times e partidas antes de pedir o rodízio", async () => {
    const db = client({
      id: "round-1",
      teams: [{ id: "team-2", position: 2 }, { id: "team-1", position: 1 }],
      matches: [
        { id: "match-2", match_order: 2, created_at: "2026-10-17T10:02:00Z" },
        { id: "match-1", match_order: 1, created_at: "2026-10-17T10:01:00Z" },
      ],
    });
    const result = await buildQuickStartSuggestion(db as unknown as Parameters<typeof buildQuickStartSuggestion>[0], "round-1", "match-1");
    expect(result?.round.teams.map((team) => team.id)).toEqual(["team-1", "team-2"]);
    expect(result?.round.matches.map((match) => match.id)).toEqual(["match-1", "match-2"]);
    expect(suggestNextMatchRotation).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "team-1" })]),
      expect.arrayContaining([expect.objectContaining({ id: "match-1" })]),
      "match-1",
    );
    expect(db.query.eq).toHaveBeenCalledWith("id", "round-1");
  });

  it("não oferece início rápido quando não há rodízio", async () => {
    vi.mocked(suggestNextMatchRotation).mockReturnValueOnce(null);
    const db = client({ id: "round-1", teams: [], matches: [] });
    expect(await buildQuickStartSuggestion(db as unknown as Parameters<typeof buildQuickStartSuggestion>[0], "round-1", "match-1"))
      .toBeNull();
  });
});
