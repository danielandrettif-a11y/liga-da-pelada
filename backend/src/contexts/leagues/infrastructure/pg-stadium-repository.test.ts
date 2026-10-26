import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgStadiumRepository } from "./pg-stadium-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const stadiumId = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "verified-user" };
const row = {
  id: stadiumId, league_id: leagueId, name: "Arena", address: null, google_maps_url: "https://maps.example",
  latitude: null, longitude: null, display_order: 1, is_active: true,
  created_at: new Date("2026-01-01T00:00:00Z"), updated_at: new Date("2026-01-01T00:00:00Z"),
};

describe("pgStadiumRepository", () => {
  it("lists member-visible stadiums with verified claims", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("FROM public.stadiums") ? { rows: [row] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgStadiumRepository(pool).list(leagueId, actor)).resolves.toEqual([
      expect.objectContaining({ id: stadiumId, created_at: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
  });

  it("serializes creation and reorders atomically for the verified admin", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("INSERT INTO public.stadiums")) return { rows: [row] };
      if (sql.includes("UPDATE public.stadiums stadium")) return { rows: [{ id: stadiumId }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgStadiumRepository(pool);
    await expect(repository.create(leagueId, {
      name: "Arena", address: null, googleMapsUrl: "https://maps.example", latitude: null, longitude: null,
    }, actor)).resolves.toMatchObject({ id: stadiumId });
    await expect(repository.reorder(leagueId, [stadiumId], actor)).resolves.toBeUndefined();
    expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(2);
  });
});
