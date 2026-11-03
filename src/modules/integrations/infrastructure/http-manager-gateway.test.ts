import { describe, it, expect, vi } from "vitest";
import { httpManagerGateway, ManagerApiError } from "./http-manager-gateway";

describe("httpManagerGateway", () => {
  it("creates club via POST /api/integrations/manager/club", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, message: "Criado!" }),
    });

    const gateway = httpManagerGateway("http://localhost:3001", "test-token", mockFetch as any);
    const res = await gateway.createClub({
      name: "Goytacaz",
      abbreviation: "GOY",
      color: "#0000ff",
      crest: "shield",
      kit: "stripes",
    }, "league-123");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/integrations/manager/club",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({ leagueId: "league-123" }));
  });

  it("runs command via POST /api/integrations/manager/command", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, message: "Aberto!" }),
    });

    const gateway = httpManagerGateway("http://localhost:3001", "test-token", mockFetch as any);
    const res = await gateway.runCommand({ type: "open-pack", packId: "p1" }, 1, "league-123");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/integrations/manager/command",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({ leagueId: "league-123" }));
  });

  it("throws ManagerApiError on error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Comando inválido." }),
    });

    const gateway = httpManagerGateway("http://localhost:3001", "test-token", mockFetch as any);
    await expect(gateway.runCommand({ type: "open-pack", packId: "p1" }, 1, "league-123")).rejects.toThrow(ManagerApiError);
  });
});
