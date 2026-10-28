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

  it("builds a real shuffle preview from scoped round players", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("EXISTS (") && sql.includes("FROM public.rounds r")) {
        return { rows: [{ status: "active", has_live_match: false }] };
      }
      if (sql.includes("SELECT id FROM public.teams")) {
        return { rows: [{ id: "team-a" }, { id: "team-b" }] };
      }
      if (sql.includes("FROM public.team_players tp")) {
        return { rows: [
          { team_id: "team-a", team_position: 1, player_id: "p1", is_goalkeeper: true, player_profile: "defensive", speed_rating: 1 },
          { team_id: "team-a", team_position: 1, player_id: "p2", is_goalkeeper: false, player_profile: "midfield", speed_rating: 2 },
          { team_id: "team-b", team_position: 2, player_id: "p3", is_goalkeeper: true, player_profile: "defensive", speed_rating: 3 },
          { team_id: "team-b", team_position: 2, player_id: "p4", is_goalkeeper: false, player_profile: "offensive", speed_rating: 2 },
        ] };
      }
      if (sql.includes("get_latest_player_card_overalls_for_league")) {
        return { rows: [
          { player_id: "p1", overall: 70 },
          { player_id: "p2", overall: 75 },
          { player_id: "p3", overall: 72 },
          { player_id: "p4", overall: 74 },
        ] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const preview = await pgRoundRepository(pool).previewRoundTeamShuffle(roundId, leagueId, "balanced", actor);

    expect(preview.success).toBe(true);
    expect(preview.assignments).toHaveLength(2);
    expect(new Set(preview.assignments.flatMap((assignment) => assignment.playerIds))).toEqual(new Set(["p1", "p2", "p3", "p4"]));
  });

  it("applies the exact approved shuffle through the scoped RPC", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await pgRoundRepository(pool).applyRoundTeamShuffle(roundId, leagueId, {
      mode: "balanced",
      assignments: [
        { teamId: "00000000-0000-4000-8000-000000000010", playerIds: ["00000000-0000-4000-8000-000000000020"] },
        { teamId: "00000000-0000-4000-8000-000000000011", playerIds: ["00000000-0000-4000-8000-000000000021"] },
      ],
    }, actor);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("public.apply_round_team_shuffle"),
      [roundId, expect.stringContaining("team_id"), "balanced"],
    );
  });

  it("uses the canonical random shuffle RPC when there is no preview payload", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await pgRoundRepository(pool).applyRoundTeamShuffle(roundId, leagueId, { mode: "random" }, actor);

    expect(query).toHaveBeenCalledWith("SELECT public.shuffle_round_teams($1::uuid)", [roundId]);
  });
});
