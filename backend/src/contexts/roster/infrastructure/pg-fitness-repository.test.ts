import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgFitnessRepository } from "./pg-fitness-repository.js";

const playerId = "00000000-0000-4000-8000-000000000001";
const leagueId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const actor = { userId: "verified-user" };

describe("pgFitnessRepository", () => {
  it("keeps self-service reads bound to the account player", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("SELECT player_id")
      ? { rows: [{ player_id: playerId }] }
      : sql.includes("FROM public.round_players")
        ? { rows: [{
            round_id: roundId, number: 4, date: "2026-10-20", round_type: "official",
            fitness_id: null, distance_km: null, average_speed_kmh: null,
            fitness_created_at: null, fitness_updated_at: null,
          }] }
        : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgFitnessRepository(pool);
    await expect(repository.listMyRounds(playerId, leagueId, actor)).resolves.toMatchObject([
      { roundId, number: 4, roundType: "official", fitness: null },
    ]);
    await expect(repository.listMyRounds("00000000-0000-4000-8000-000000000009", leagueId, actor)).resolves.toEqual([]);
  });

  it("validates ownership in the same transaction before upsert", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("SELECT player_id")
      ? { rows: [{ player_id: playerId }] }
      : sql.includes("can_manage_own_fitness")
        ? { rows: [{ allowed: true }] }
        : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgFitnessRepository(pool).saveMyFitness(roundId, 5.5, 12, actor)).resolves.toBe(playerId);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO public.player_round_fitness"), [playerId, roundId, 5.5, 12]);
  });

  it("hides summaries when the target did not opt in", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("show_fitness_stats")
      ? { rows: [{ show_fitness_stats: false, owns: false }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgFitnessRepository(pool).listSummaryMeasurements(playerId, leagueId, actor)).resolves.toBeNull();
  });
});
