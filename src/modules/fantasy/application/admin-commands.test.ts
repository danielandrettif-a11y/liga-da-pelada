import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeFantasyTestSession,
  previewFantasyMarket,
  reprocessFantasyRoundForLeague,
  updateFantasyConfiguration,
  type FantasyAdminCommandGateway,
} from "./admin-commands";

const gateway = {
  updateSettings: vi.fn(), findFantasySeasonId: vi.fn(), previewMarket: vi.fn(),
  roundBelongsToLeague: vi.fn(), rebuildRoundStats: vi.fn(), reprocessRound: vi.fn(),
  repairLegacyLineups: vi.fn(), changeTestSession: vi.fn(),
} satisfies FantasyAdminCommandGateway;

beforeEach(() => {
  vi.clearAllMocks();
  gateway.updateSettings.mockResolvedValue(null);
  gateway.findFantasySeasonId.mockResolvedValue("fantasy-a");
  gateway.previewMarket.mockResolvedValue({ data: { ok: true }, error: null });
  gateway.roundBelongsToLeague.mockResolvedValue(true);
  gateway.rebuildRoundStats.mockResolvedValue({ success: true });
  gateway.reprocessRound.mockResolvedValue({ affectedRounds: 3, error: null });
  gateway.changeTestSession.mockResolvedValue(null);
});

describe("fantasy admin commands", () => {
  it("não configura Cartola em pelada básica", async () => {
    const result = await updateFantasyConfiguration({ captainMultiplier: 2 }, { id: "league-a", featureTier: "basic" }, gateway);
    expect(result.success).toBe(false);
    expect(gateway.updateSettings).not.toHaveBeenCalled();
  });

  it("escopa configuração pela pelada completa", async () => {
    await updateFantasyConfiguration({ captainMultiplier: 2 }, { id: "league-a", featureTier: "complete" }, gateway);
    expect(gateway.updateSettings).toHaveBeenCalledWith("league-a", { captainMultiplier: 2 });
  });

  it("localiza a temporada pela pelada antes da prévia", async () => {
    expect(await previewFantasyMarket("season-a", "league-a", gateway)).toEqual({ success: true, preview: { ok: true } });
    expect(gateway.findFantasySeasonId).toHaveBeenCalledWith("season-a", "league-a");
    expect(gateway.previewMarket).toHaveBeenCalledWith("fantasy-a");
  });

  it("rejeita rodada externa antes do recálculo", async () => {
    gateway.roundBelongsToLeague.mockResolvedValueOnce(false);
    const result = await reprocessFantasyRoundForLeague("round-b", "league-a", "current", gateway);
    expect(result.success).toBe(false);
    expect(gateway.rebuildRoundStats).not.toHaveBeenCalled();
  });

  it("recalcula scouts antes de reprocessar e devolve a contagem", async () => {
    const result = await reprocessFantasyRoundForLeague("round-a", "league-a", "current", gateway);
    expect(result).toEqual({ success: true, affectedRounds: 3 });
    expect(gateway.reprocessRound).toHaveBeenCalledAfter(gateway.rebuildRoundStats);
  });

  it("protege as sessões de teste pelo escopo da pelada", async () => {
    await changeFantasyTestSession("round-a", "league-a", "reset", gateway);
    expect(gateway.changeTestSession).toHaveBeenCalledWith("round-a", "reset");
  });
});
