import { describe, expect, it, vi } from "vitest";
import { isDashboardCallupVisible, readDashboardCallups } from "./dashboard-callups";

describe("convocações na página inicial", () => {
  it("busca a lista convertida após o sorteio na pelada selecionada", async () => {
    const query: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn() };
    for (const method of ["select", "eq", "in", "order"]) query[method].mockReturnValue(query);
    const client = { from: vi.fn().mockReturnValue(query) };
    await readDashboardCallups(client as any, "league-1");
    expect(query.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(query.in).toHaveBeenCalledWith("status", ["open", "locked", "converted"]);
  });

  it("mantém a lista visível depois do sorteio e a oculta após o início", () => {
    expect(isDashboardCallupVisible({ round: { status: "draft", matches: [] } })).toBe(true);
    expect(isDashboardCallupVisible({ round: { status: "draft", matches: [{ status: "pending", started_at: null }] } })).toBe(true);
    expect(isDashboardCallupVisible({ round: { status: "active", matches: [{ status: "live", started_at: null }] } })).toBe(false);
    expect(isDashboardCallupVisible({ round: { status: "active", matches: [{ status: "pending", started_at: "2026-11-13T20:15:00Z" }] } })).toBe(false);
    expect(isDashboardCallupVisible({ round: { status: "finished", matches: [] } })).toBe(false);
  });
});
