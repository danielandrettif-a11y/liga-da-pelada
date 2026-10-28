import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgRoundRepository } from "./pg-round-repository.js";

const seasonId = "00000000-0000-4000-8000-000000000001";
const leagueId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const actor = { userId: "user-123" };

describe("pgRoundRepository", () => {
  it("queries member-visible rounds for a season", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.rounds r")) {
        return {
          rows: [
            {
              id: roundId,
              league_id: leagueId,
              season_id: seasonId,
              number: 1,
              date: "2026-10-30",
              start_time: "08:00:00",
              status: "active",
              round_type: "official",
              formation_mode: "auto",
              target_players_per_team: 6,
              target_teams_per_round: 4,
              arrival_order_enabled: true,
              preparation_stage: "teams_ready",
              stadium_id: null,
              stadium_name: null,
              stadium_map_url: null,
              notes: null,
              payment_pix: null,
              payment_total: null,
              best_goalkeeper_player_id: null,
              created_at: new Date("2026-10-27T10:00:00Z"),
              player_count: 24,
              match_count: 5,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgRoundRepository(pool);
    const result = await repo.getRounds(seasonId, actor);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(roundId);
    expect(result[0]?.round_players).toEqual([{ count: 24 }]);
    expect(result[0]?.matches).toEqual([{ count: 5 }]);
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
  });

  it("queries active league configuration", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.leagues")) {
        return {
          rows: [
            {
              id: leagueId,
              players_per_team: 6,
              teams_per_round: 4,
              match_duration: 7,
              stadium_name: "Arena Central",
              stadium_map_url: null,
              event_duration_minutes: 120,
              preseason_enabled: false,
              feature_tier: "complete",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgRoundRepository(pool);
    const league = await repo.getActiveLeague(leagueId, actor);

    expect(league.id).toBe(leagueId);
    expect(league.players_per_team).toBe(6);
  });

  it("deletes a round as league admin", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("DELETE FROM public.rounds")) return { rowCount: 1 };
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgRoundRepository(pool);
    await expect(repo.deleteRound(roundId, leagueId, actor)).resolves.toBeUndefined();
  });

  it("saves a round prelist via RPC", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("save_round_prelist")) return { rows: [{ save_round_prelist: roundId }] };
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgRoundRepository(pool);
    const result = await repo.saveRoundPrelist({
      date: "2026-10-30",
      playerIds: ["p1", "p2"],
    }, leagueId, actor);

    expect(result).toEqual({ roundId });
  });
});
