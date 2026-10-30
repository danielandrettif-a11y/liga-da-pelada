import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PgSeasonRankingRepository } from "./pg-season-ranking-repository.js";
import type { Actor } from "../../../shared/actor.js";

const mockActor: Actor = { userId: "user-infra-test" };

function createMockPool(queryMock: ReturnType<typeof vi.fn>): Pool {
  const client: Partial<PoolClient> = {
    query: queryMock,
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(client as PoolClient),
  } as unknown as Pool;
}

describe("PgSeasonRankingRepository", () => {
  it("findActiveLeaguePlayerIds keeps only active members of the requested league", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.league_members")) {
        return { rows: [{ player_id: "member-1" }] };
      }
      return { rows: [] };
    });
    const repo = new PgSeasonRankingRepository(createMockPool(query));

    const result = await repo.findActiveLeaguePlayerIds(mockActor, "league-1", ["member-1", "outsider-1"]);

    expect(result).toEqual(["member-1"]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("membership.is_active = true"),
      ["league-1", ["member-1", "outsider-1"]],
    );
  });

  it("findActiveSeason returns season meta or null", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [] };
      if (sql.includes("FROM public.seasons")) {
        return {
          rows: [
            { id: "s1", number: 3, status: "active", started_at: "2026-01-01T00:00:00Z" },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgSeasonRankingRepository(createMockPool(query));
    const result = await repo.findActiveSeason(mockActor, "league-1");

    expect(result).toEqual({
      id: "s1",
      number: 3,
      status: "active",
      startedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("findFinishedOfficialRounds returns mapped rounds", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [] };
      if (sql.includes("FROM public.rounds")) {
        return {
          rows: [
            {
              id: "r1",
              number: 1,
              date: "2026-01-10",
              season_id: "s1",
              best_goalkeeper_player_id: "p-gk",
              scoring_snapshot: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgSeasonRankingRepository(createMockPool(query));
    const rounds = await repo.findFinishedOfficialRounds(mockActor, ["s1"]);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].id).toBe("r1");
    expect(rounds[0].number).toBe(1);
    expect(rounds[0].bestGoalkeeperPlayerId).toBe("p-gk");
  });

  it("findPlayerRoundStats parses and formats player stats rows", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [] };
      if (sql.includes("FROM public.player_round_stats")) {
        return {
          rows: [
            {
              player_id: "p1",
              round_id: "r1",
              games: "1",
              wins: "1",
              draws: "0",
              losses: "0",
              goals: "2",
              assists: "1",
              points: "12",
              ranking_points: "12.5",
              ranking_role_weights: [],
              player: { id: "p1", name: "Player 1" },
            },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgSeasonRankingRepository(createMockPool(query));
    const stats = await repo.findPlayerRoundStats(mockActor, ["r1"]);

    expect(stats).toHaveLength(1);
    expect(stats[0].player_id).toBe("p1");
    expect(stats[0].games).toBe(1);
    expect(stats[0].goals).toBe(2);
    expect(stats[0].ranking_points).toBe(12.5);
    expect(stats[0].player.name).toBe("Player 1");
  });

  it("findEnrichmentData queries fitness, cosmetics, and RPCs safely", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [] };
      if (sql.includes("player_round_fitness")) {
        return { rows: [{ player_id: "p1", distance_km: 6.0, average_speed_kmh: 9.5 }] };
      }
      if (sql.includes("player_equipped_cosmetics")) {
        return { rows: [{ player_id: "p1", slot: "title", name: "Lenda", asset_key: "title_legend" }] };
      }
      if (sql.includes("get_latest_player_card_overalls_for_league")) {
        return {
          rows: [
            {
              player_id: "p1",
              overall: 85,
              trend: "rising",
              def_overall: 70,
              ala_mei_overall: 80,
              ata_overall: 85,
              gol_overall: 50,
            },
          ],
        };
      }
      if (sql.includes("get_public_player_speed_ratings_for_league")) {
        return { rows: [{ player_id: "p1", speed_rating: 3 }] };
      }
      if (sql.includes("get_league_achievement_belt_holders")) {
        return { rows: [{ player_id: "p1", belts: [{ id: "b1", name: "Artilheiro Nato" }] }] };
      }
      return { rows: [] };
    });

    const repo = new PgSeasonRankingRepository(createMockPool(query));
    const enrichment = await repo.findEnrichmentData(mockActor, "league-1", "season-1", ["r1"], ["p1"]);

    expect(enrichment.fitnessRows).toHaveLength(1);
    expect(enrichment.cosmeticsByPlayer.get("p1")?.titleName).toBe("Lenda");
    expect(enrichment.overallByPlayer.get("p1")?.overall).toBe(85);
    expect(enrichment.speedByPlayer.get("p1")).toBe(3);
    expect(enrichment.achievementBeltsByPlayer.get("p1")?.[0]?.name).toBe("Artilheiro Nato");
  });

  it("findLeaguePlayer and findPlayerCosmetics return player and cosmetics data", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [] };
      if (sql.includes("FROM public.players p")) {
        return { rows: [{ id: "p1", name: "League Member" }] };
      }
      if (sql.includes("FROM public.player_equipped_cosmetics")) {
        return { rows: [{ slot: "frame", name: "Gold", asset_key: "gold_frame" }] };
      }
      return { rows: [] };
    });

    const repo = new PgSeasonRankingRepository(createMockPool(query));
    const player = await repo.findLeaguePlayer(mockActor, "league-1", "p1");
    expect(player?.name).toBe("League Member");

    const cosmetics = await repo.findPlayerCosmetics(mockActor, "p1");
    expect(cosmetics?.frameKey).toBe("gold_frame");
  });
});

