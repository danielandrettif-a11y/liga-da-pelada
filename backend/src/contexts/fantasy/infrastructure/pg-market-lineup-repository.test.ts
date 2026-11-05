import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DEFAULT_FANTASY_SETTINGS } from "../domain/config.js";
import { PgFantasyMarketLineupRepository } from "./pg-market-lineup-repository.js";

const mockReadLiveFantasyProjection = vi.hoisted(() => vi.fn());
vi.mock("./pg-live-fantasy-projection.js", () => ({
  readLiveFantasyProjection: mockReadLiveFantasyProjection,
}));

describe("Infrastructure: PgFantasyMarketLineupRepository", () => {
  const createMockPool = (queryHandler: (sql: string, params?: any[]) => Promise<any>): Pool => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("SET LOCAL ROLE")) return Promise.resolve({});
        return queryHandler(sql, params);
      }),
      release: vi.fn(),
    };
    return {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
  };

  beforeEach(() => {
    mockReadLiveFantasyProjection.mockReset();
    mockReadLiveFantasyProjection.mockResolvedValue(null);
  });

  it("checks admin status correctly", async () => {
    const pool = createMockPool(async (sql, params) => {
      if (sql.includes("public.is_league_admin")) {
        return { rows: [{ allowed: 1 }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const isAdmin = await repo.isLeagueAdmin("league-1", "user-1");
    expect(isAdmin).toBe(true);
  });

  it("returns dashboard data with players and calculated balance", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.leagues")) {
        return { rows: [{ feature_tier: "complete" }] };
      }
      if (sql.includes("FROM public.seasons season") && sql.includes("fantasy_seasons")) {
        return { rows: [{ season_id: "core-season-1", fantasy_season_id: "season-1",
          initial_budget: 100, initial_player_price: 10 }] };
      }
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) {
        return { rows: [{ id: "fantasy-round-1", fantasy_round_id: "fantasy-round-1",
          round_id: "round-1", number: 1, status: "draft", market_status: "open", has_started: false }] };
      }
      if (sql.includes("FROM public.fantasy_accounts")) {
        return { rows: [{ current_budget: 100 }] };
      }
      if (sql.includes("FROM public.fantasy_lineups lineup") && sql.includes("lineup.user_id")) {
        return { rows: ["u1", "u2", "u3"].map((user_id) => ({
          id: `lineup-${user_id}`, user_id, fantasy_round_id: "fantasy-round-1",
          captain_player_id: "p1", players: [{ player_id: "p1" }], reserves: [],
        })) };
      }
      if (sql.includes("FROM public.league_members member")) {
        return { rows: [{ id: "p1", name: "Player 1", current_price: 8.5, is_goalkeeper: false, total_points: 75, rounds_played: 1 }] };
      }
      if (sql.includes("count(*)::int count FROM public.fantasy_lineups")) {
        return { rows: [{ count: 3 }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const data = await repo.getDashboard("league-1", "user-1");

    expect(data.authenticated).toBe(true);
    expect(data.available).toBe(true);
    expect(data.marketOpen).toBe(true);
    expect(data.budget).toBe(100);
    expect(data.marketBudgetFloor).toBeNull();
    expect(data.budgetSupportApplied).toBe(false);
    expect(data.spent).toBe(0);
    expect(data.balance).toBe(100);
    expect(data.players.length).toBe(1);
    expect(data.confirmedCount).toBe(3);
    expect(data).toMatchObject({
      fantasySeasonId: "season-1",
      fantasyRound: { id: "fantasy-round-1", status: "open", betweenRounds: false },
      market: [{ id: "p1", name: "Player 1", popularityPercent: 100 }],
      radar: { totalLineups: 3, hasMinSample: true },
      liveProjection: { isLive: false },
    });
  });

  it("returns the rich player detail contract with the selected round projection", async () => {
    mockReadLiveFantasyProjection.mockResolvedValue({
      roundId: "round-1", fantasyRoundId: "fantasy-round-1", isLive: true,
      settings: DEFAULT_FANTASY_SETTINGS, matches: [],
      byUserId: new Map([["user-1", { userId: "user-1", players: [{ playerId: "p1",
        basePoints: 6, positionBonus: 1, captainBonus: 3.5, totalPoints: 10.5 }] }]]),
      storedPlayersByUserId: new Map(),
      statsByPlayer: new Map([["p1", { playerId: "p1", playerProfile: "offensive", games: 1,
        goals: 1, assists: 0, wins: 1, draws: 0, losses: 0, ownGoals: 0,
        goalkeeperGames: 0, goalkeeperGoals: 0, goalkeeperAssists: 0, goalkeeperOwnGoals: 0,
        goalkeeperWins: 0, goalkeeperDraws: 0, goalkeeperLosses: 0, goalsConceded: 0,
        cleanSheets: 0, defensiveCleanGames: 0, defensiveOneGoalGames: 0,
        teamGoalsConceded: 0, basePoints: 6 }]]),
    });
    const pool = createMockPool(async (sql) => {
      if (sql.includes("member.player_profile profile")) return { rows: [{ id: "p1", name: "Atleta",
        avatar_url: null, member_category: "player", is_goalkeeper: false, profile: "offensive",
        fantasy_season_id: "season-1", current_price: 12, total_points: 20, rounds_played: 2 }] };
      if (sql.includes("SELECT history.id")) return { rows: [{ id: "h1", fantasy_round_id: "fantasy-round-1",
        round_number: 1, round_date: "2026-01-01", price_before: 10, price_after: 12,
        variation_rate: 0.2, price_change: 2, round_points: 6, goals: 1, assists: 0,
        wins: 1, games: 1, created_at: "2026-01-01T12:00:00Z" }] };
      if (sql.includes("SELECT stats.*")) return { rows: [{ goals: 2, assists: 1, wins: 2,
        losses: 0, games: 2, goalkeeper_games: 0, goals_conceded: 0 }] };
      if (sql.includes("banner.asset_key")) return { rows: [{ banner_asset_key: "banner", frame_asset_key: "frame" }] };
      if (sql.includes("fantasy_round.fantasy_season_id")) return { rows: [{ id: "fantasy-round-1",
        round_id: "round-1", market_status: "in_progress", status: "in_progress", number: 1,
        date: "2026-01-01" }] };
      if (sql.includes("lineup.captain_player_id")) return { rows: [{ captain_player_id: "p1",
        slot_role: "ATA", base_points: 0, position_bonus: 0, captain_bonus: 0, total_points: 0 }] };
      if (sql.includes("SELECT * FROM public.player_round_stats")) return { rows: [] };
      return { rows: [] };
    });

    const result = await new PgFantasyMarketLineupRepository(pool)
      .getPlayerDetail("league-1", "p1", "user-1");

    expect(result).toMatchObject({
      player: { id: "p1", name: "Atleta", profile: "offensive" },
      price: 12, totalPoints: 20, roundsPlayed: 2,
      stats: { goals: 2, assists: 1, games: 2 },
      roundDetail: { status: "live", slotRole: "ATA", isCaptain: true, totalPoints: 10.5 },
      cosmetics: { bannerAssetKey: "banner", frameKey: "frame" },
    });
    expect(result?.history[0]).toMatchObject({ fantasyRoundId: "fantasy-round-1", roundPoints: 10.5 });
  });

  it("saves lineup and returns lineupId", async () => {
    let saveParams: any[] | undefined;
    const pool = createMockPool(async (sql, params) => {
      if (sql.includes("SELECT 1 FROM public.rounds round_item")) {
        return { rows: [{ exists: 1 }], rowCount: 1 };
      }
      if (sql.includes("fantasy_test_sessions")) return { rows: [], rowCount: 0 };
      if (sql.includes("public.save_fantasy_lineup_with_reserve")) {
        saveParams = params;
        return { rows: [{ id: "lineup-xyz" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.saveLineup({
      leagueId: "l1",
      roundId: "r1",
      userId: "u1",
      input: {
        roundId: "r1", playerIds: ["p1"], captainId: "p1",
        scorerId: "p1", assistId: "p1", challengeId: "p1",
        reservePlayerId: "p2", reserveRole: "ATA",
        slotAssignments: [{ slotRole: "ATA", slotIndex: 0, playerId: "p1" }],
      },
      totalCost: 10,
    });

    expect(result.success).toBe(true);
    expect(result.lineupId).toBe("lineup-xyz");
    expect(saveParams).toEqual([
      "r1", ["p1"], "p1", "p1", "p1", "p1",
      JSON.stringify([{ player_id: "p1", slot_index: 0, slot_role: "ATA" }]),
      "p2", "ATA",
    ]);
  });

  it("returns quick highlights with the public action contract", async () => {
    const pool = createMockPool(async (sql) => sql.includes("LEFT JOIN LATERAL") ? { rows: [
      { name: "A", avatar_url: null, last_round_points: 9, last_price_change: 1, variation_rate: 2 },
      { name: "B", avatar_url: "b.png", last_round_points: 4, last_price_change: -2, variation_rate: -3 },
    ] } : { rows: [] });

    const result = await new PgFantasyMarketLineupRepository(pool).getQuickHighlights("l1", "u1");
    expect(result?.topScorer?.name).toBe("A");
    expect(result?.topGain?.variation).toBe(2);
    expect(result?.topDrop?.name).toBe("B");
  });

  it("returns personal history in the same nested shape as the Supabase reader", async () => {
    const row = { id: "lineup-1", status: "scored", fantasy_rounds: { round_id: "r1", rounds: { number: 1 } } };
    const pool = createMockPool(async (sql) => sql.includes("jsonb_build_object('round_id'")
      ? { rows: [row] } : { rows: [] });

    const result = await new PgFantasyMarketLineupRepository(pool).getMyHistory("l1", "u1");
    expect(result).toEqual([row]);
  });

  it("merges the live projection into my summary", async () => {
    mockReadLiveFantasyProjection.mockResolvedValue({
      roundId: "round-live", isLive: true,
      byUserId: new Map([["u1", { userId: "u1", totalPoints: 8, captainBonus: 2,
        players: [{ playerId: "p1", slotRole: "ATA", totalPoints: 8 }] }]]),
      statsByPlayer: new Map(),
    });
    const pool = createMockPool(async (sql) => {
      if (sql.includes("WITH active_season AS")) return { rows: [{ user_id: "u1", total_points: 10,
        best_round_points: 10, captain_bonus_points: 1, def_points: 0, attack_points: 10,
        attack_selection_count: 1, current_budget: 55, is_live: false }] };
      if (sql.includes("SELECT fantasy_season.id")) return { rows: [{ id: "season-1" }] };
      return { rows: [] };
    });

    const result = await new PgFantasyMarketLineupRepository(pool).getMySummary("league-1", "u1");

    expect(result).toMatchObject({ user_id: "u1", total_points: 18, best_round_points: 10,
      captain_bonus_points: 3, attack_points: 18, attack_selection_count: 2, is_live: true });
  });

  it("returns revealed lineups only when market is closed", async () => {
    mockReadLiveFantasyProjection.mockResolvedValue({
      roundId: "round-1", isLive: false,
      byUserId: new Map([["u1", { userId: "u1", players: [{ playerId: "p1", slotRole: "ATA",
        totalPoints: 50 }], reserve: null }]]), statsByPlayer: new Map(),
    });
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) {
        return { rows: [{ id: "fantasy-round-1", fantasy_season_id: "season-1", round_id: "round-1",
          market_status: "finished", status: "finished", number: 1, date: "2026-01-01" }] };
      }
      if (sql.includes("FROM public.fantasy_lineups lineup")) {
        return {
          rows: [
            {
              id: "l1",
              user_id: "u1",
              captain_player_id: "p1",
              prediction_points: 0,
              score_breakdown: {},
              profile: { name: "Alice", avatar_url: null },
              players: [{ id: "lp1", player_id: "p1", slot_index: 0, slot_role: "ATA", total_points: 45.5,
                player_name_locked: "Atleta", avatar_url_locked: null, price_locked: 10 }],
              reserves: [],
            },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "user-1", "round-1");

    expect(result.allowed).toBe(true);
    expect(result.lineups.length).toBe(1);
    expect(result.lineups[0]).toMatchObject({ userId: "u1", userName: "Alice", totalPoints: 50,
      players: [{ playerId: "p1", points: 50 }] });
  });

  it("blocks revealed lineups when market is open", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) {
        return { rows: [{ id: "fantasy-round-1", market_status: "open" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "user-1", "round-1");

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("após o fechamento do mercado");
  });

  it("keeps missed lineups pending in an open round overview", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("EXISTS(SELECT 1 FROM public.matches")) {
        return { rows: [{ id: "fantasy-round-1", round_id: "round-1", number: 1,
          date: "2026-01-01", market_status: "open", status: "open", has_started: false }] };
      }
      if (sql.includes("FROM public.fantasy_accounts account")) {
        return { rows: [
          { user_id: "u1", saved_at: "2026-01-01T12:00:00Z", lineup_status: "saved",
            player: { name: "Alice", avatar_url: null }, cosmetics: null },
          { user_id: "u2", saved_at: "2026-01-01T12:01:00Z", lineup_status: "missed",
            player: { name: "Bob", avatar_url: null }, cosmetics: null },
        ] };
      }
      return { rows: [] };
    });

    const result = await new PgFantasyMarketLineupRepository(pool)
      .getRoundLineupOverview("league-1", "u1", "round-1");

    expect(result.confirmed.map((item) => item.userId)).toEqual(["u1"]);
    expect(result.pending.map((item) => item.userId)).toEqual(["u2"]);
    expect(result.pending[0]?.savedAt).toBeNull();
  });

  it("uses the live projection in a closed round overview ranking", async () => {
    mockReadLiveFantasyProjection.mockResolvedValue({
      roundId: "round-1", isLive: true,
      byUserId: new Map([["u1", { userId: "u1", players: [{ playerId: "p1", slotRole: "ATA",
        totalPoints: 15 }] }]]), statsByPlayer: new Map(),
    });
    const pool = createMockPool(async (sql) => {
      if (sql.includes("EXISTS(SELECT 1 FROM public.matches")) return { rows: [{
        id: "fantasy-round-1", fantasy_season_id: "season-1", round_id: "round-1", number: 1,
        date: "2026-01-01", market_status: "in_progress", status: "in_progress", has_started: true,
      }] };
      if (sql.includes("FROM public.fantasy_lineups lineup")) return { rows: [{
        id: "lineup-1", user_id: "u1", total_points: 10, current_budget: 55,
        rounds_played: 1, is_live: false, roundCard: null,
      }] };
      return { rows: [] };
    });

    const result = await new PgFantasyMarketLineupRepository(pool)
      .getRoundLineupOverview("league-1", "u1", "round-1");

    expect(result).toMatchObject({ isRoundOpen: false, confirmedCount: 1,
      ranking: [{ user_id: "u1", total_points: 15, is_live: true, position: 1 }] });
  });
});

