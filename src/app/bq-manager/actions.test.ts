import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockManagerApi = {
  createClub: vi.fn().mockResolvedValue({ ok: true, message: "Clube criado!", save: { version: 1 } }),
  runCommand: vi.fn().mockResolvedValue({ ok: true, message: "Comando executado!", save: { version: 2 } }),
};

vi.mock("@/modules/integrations/infrastructure/manager-api-session", () => ({
  managerApiFor: vi.fn().mockImplementation(() => Promise.resolve(mockManagerApi)),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentAccount: vi.fn().mockResolvedValue({
    user: { id: "user-123" },
    isAdmin: false,
    client: { from: vi.fn() },
    profile: { player_id: "player-123" },
  }),
}));

vi.mock("@/lib/league-context", () => ({
  getSelectedLeague: vi.fn().mockResolvedValue({ id: "league-123", featureTier: "complete" }),
}));

vi.mock("@/lib/bq-manager/server", () => ({
  readManagerSourceLeague: vi.fn().mockResolvedValue("league-123"),
  createManagerClient: vi.fn().mockReturnValue(null),
}));

import { createManagerClub, runManagerCommand } from "./actions";

describe("Server Actions: BQ Manager Bridging (2 operations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates createManagerClub to managerApi", async () => {
    const res = await createManagerClub({
      name: "Clube Teste",
      abbreviation: "CLB",
      color: "#ffffff",
      crest: "shield",
      kit: "solid",
    });

    expect(mockManagerApi.createClub).toHaveBeenCalledWith({
      name: "Clube Teste",
      abbreviation: "CLB",
      color: "#ffffff",
      crest: "shield",
      kit: "solid",
    });
    expect(res.ok).toBe(true);
  });

  it("delegates runManagerCommand to managerApi", async () => {
    const res = await runManagerCommand({ type: "open-pack", packId: "p1" }, 1);
    expect(mockManagerApi.runCommand).toHaveBeenCalledWith({ type: "open-pack", packId: "p1" }, 1);
    expect(res.ok).toBe(true);
  });
});
