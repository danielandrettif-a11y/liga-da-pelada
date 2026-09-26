import { describe, expect, it } from "vitest";
import { rankingActivePlayerIds } from "./ranking";

describe("rankingActivePlayerIds", () => {
  const rows = [
    { round_id: "r1", player_id: "active", games: 1 },
    { round_id: "r1", player_id: "absent", games: 0 },
    { round_id: "r0", player_id: "stale", games: 2 },
    { round_id: "r3", player_id: "returned", games: 1 },
  ];

  it("mantém quem jogou em ao menos uma das três últimas peladas", () => {
    expect([...rankingActivePlayerIds(["r3", "r2", "r1"], rows)].sort()).toEqual(["active", "returned"]);
  });

  it("volta a incluir imediatamente após uma nova atuação", () => {
    expect(rankingActivePlayerIds(["r3", "r2", "r1"], rows).has("returned")).toBe(true);
  });
});

