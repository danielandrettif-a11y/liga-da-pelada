import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/actor.js";
import {
  ManageSeasonRankingUseCase,
  type RankingRawEnrichmentData,
  type SeasonRankingRepository,
} from "./manage-season-ranking.js";
import type {
  OfficialRoundMeta,
  RankingDetailStatsRow,
  VisibleSeasonMeta,
} from "../domain/season-ranking.js";

const mockActor: Actor = { userId: "user-test" };

describe("ManageSeasonRankingUseCase", () => {
  it("returns empty experience when no active season exists", async () => {
    const repo: SeasonRankingRepository = {
      findActiveSeason: vi.fn().mockResolvedValue(null),
      findVisibleSeasons: vi.fn().mockResolvedValue([]),
      findFinishedOfficialRounds: vi.fn().mockResolvedValue([]),
      findPlayerRoundStats: vi.fn().mockResolvedValue([]),
      findEnrichmentData: vi.fn().mockResolvedValue({
        fitnessRows: [],
        cosmeticsByPlayer: new Map(),
        overallByPlayer: new Map(),
        speedByPlayer: new Map(),
        achievementBeltsByPlayer: new Map(),
      }),
      findLeaguePlayer: vi.fn().mockResolvedValue(null),
      findPlayerCosmetics: vi.fn().mockResolvedValue(null),
    };

    const useCase = new ManageSeasonRankingUseCase(repo);
    const result = await useCase.getSeasonRankingExperience(mockActor, "league-1");

    expect(result.general).toEqual([]);
    expect(result.seasonLabel).toBe("Temporada atual");
    expect(result.monthly).toBeNull();
  });

  it("calculates ranking experience, general, monthly, and latestRound correctly", async () => {
    const activeSeason: VisibleSeasonMeta = {
      id: "season-1",
      number: 2,
      status: "active",
      startedAt: "2026-02-01T12:00:00Z",
    };

    const rounds: OfficialRoundMeta[] = [
      { id: "r2", number: 2, date: "2026-02-15", seasonId: "season-1" },
      { id: "r1", number: 1, date: "2026-02-08", seasonId: "season-1" },
    ];

    const stats: RankingDetailStatsRow[] = [
      {
        player_id: "p1",
        round_id: "r2",
        games: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        goals: 2,
        assists: 1,
        points: 15,
        ranking_points: 15,
        goalkeeper_games: 0,
        goalkeeper_goals: 0,
        goalkeeper_assists: 0,
        goalkeeper_own_goals: 0,
        goals_conceded: 0,
        clean_sheets: 0,
        own_goals: 0,
        defensive_clean_games: 0,
        defensive_one_goal_games: 0,
        team_goals_conceded: 0,
        ranking_defensive_clean_games: 0,
        ranking_defensive_one_goal_games: 0,
        ranking_role_weights: [],
        ranking_position_bonus: 0,
        player_profile_locked: "offensive",
        profile_decision_source: "initial",
        profile_appearance_number: 1,
        profile_def_overall: null,
        profile_ata_overall: null,
        player: {
          id: "p1",
          name: "Player 1",
          is_competitive_profile_complete: true,
          is_selectable: true,
          member_category: "player",
        },
      },
      {
        player_id: "p2",
        round_id: "r2",
        games: 1,
        wins: 0,
        draws: 0,
        losses: 1,
        goals: 0,
        assists: 0,
        points: 5,
        ranking_points: 5,
        goalkeeper_games: 0,
        goalkeeper_goals: 0,
        goalkeeper_assists: 0,
        goalkeeper_own_goals: 0,
        goals_conceded: 0,
        clean_sheets: 0,
        own_goals: 0,
        defensive_clean_games: 0,
        defensive_one_goal_games: 0,
        team_goals_conceded: 0,
        ranking_defensive_clean_games: 0,
        ranking_defensive_one_goal_games: 0,
        ranking_role_weights: [],
        ranking_position_bonus: 0,
        player_profile_locked: "defensive",
        profile_decision_source: "initial",
        profile_appearance_number: 1,
        profile_def_overall: null,
        profile_ata_overall: null,
        player: {
          id: "p2",
          name: "Player 2",
          is_competitive_profile_complete: true,
          is_selectable: true,
          member_category: "player",
        },
      },
    ];

    const enrichment: RankingRawEnrichmentData = {
      fitnessRows: [{ player_id: "p1", distance_km: 5.2, average_speed_kmh: 8.5 }],
      cosmeticsByPlayer: new Map([
        [
          "p1",
          {
            frameKey: "gold-frame",
            auraKey: null,
            titleName: "Artilheiro",
            bannerAssetKey: null,
            nameplateKey: null,
          },
        ],
      ]),
      overallByPlayer: new Map([
        [
          "p1",
          {
            overall: 82,
            trend: "rising",
            positions: { DEF: 60, ALA_MEI: 75, ATA: 82, GOL: 50 },
            positionTrends: { DEF: "steady", ALA_MEI: "rising", ATA: "rising", GOL: "steady" },
            goalkeeperGames: 0,
            goalkeeperRounds: 0,
            roundsPlayed: 2,
          },
        ],
      ]),
      speedByPlayer: new Map([["p1", 3]]),
      achievementBeltsByPlayer: new Map(),
    };

    const repo: SeasonRankingRepository = {
      findActiveSeason: vi.fn().mockResolvedValue(activeSeason),
      findVisibleSeasons: vi.fn().mockResolvedValue([]),
      findFinishedOfficialRounds: vi.fn().mockResolvedValue(rounds),
      findPlayerRoundStats: vi.fn().mockResolvedValue(stats),
      findEnrichmentData: vi.fn().mockResolvedValue(enrichment),
      findLeaguePlayer: vi.fn().mockResolvedValue(null),
      findPlayerCosmetics: vi.fn().mockResolvedValue(null),
    };

    const useCase = new ManageSeasonRankingUseCase(repo);
    const result = await useCase.getSeasonRankingExperience(mockActor, "league-1");

    expect(result.seasonLabel).toBe("Temporada 2 · 2026");
    expect(result.general).toHaveLength(2);
    expect(result.general[0].player.id).toBe("p1");
    expect(result.general[0].points).toBe(15);
    expect(result.general[0].overall).toBe(82);
    expect(result.general[0].cosmetics?.frameKey).toBe("gold-frame");
    expect(result.general[0].speedRating).toBe(3);
    expect(result.general[0].fitness?.distanceKm).toBe(5.2);

    expect(result.monthly?.key).toBe("2026-02");
    expect(result.latestRound?.id).toBe("r2");
    expect(result.latestRound?.entries).toHaveLength(2);

    // Teste de getGeneralRanking
    const general = await useCase.getGeneralRanking(mockActor, "league-1");
    expect(general).toHaveLength(2);
  });

  it("getPlayerRankingEntry returns existing entry or blank entry for registered league member", async () => {
    const activeSeason: VisibleSeasonMeta = {
      id: "season-1",
      number: 1,
      status: "active",
      startedAt: "2026-01-01T00:00:00Z",
    };
    const rounds: OfficialRoundMeta[] = [
      { id: "r1", number: 1, date: "2026-01-10", seasonId: "season-1" },
    ];
    const stats: RankingDetailStatsRow[] = [
      {
        player_id: "p1",
        round_id: "r1",
        games: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        goals: 1,
        assists: 0,
        points: 7,
        ranking_points: 7,
        goalkeeper_games: 0,
        goalkeeper_goals: 0,
        goalkeeper_assists: 0,
        goalkeeper_own_goals: 0,
        goals_conceded: 0,
        clean_sheets: 0,
        own_goals: 0,
        defensive_clean_games: 0,
        defensive_one_goal_games: 0,
        team_goals_conceded: 0,
        ranking_defensive_clean_games: 0,
        ranking_defensive_one_goal_games: 0,
        ranking_role_weights: [],
        ranking_position_bonus: 0,
        player_profile_locked: "offensive",
        profile_decision_source: null,
        profile_appearance_number: 1,
        profile_def_overall: null,
        profile_ata_overall: null,
        player: { id: "p1", name: "Player 1", is_competitive_profile_complete: true },
      },
    ];

    const repo: SeasonRankingRepository = {
      findActiveSeason: vi.fn().mockResolvedValue(activeSeason),
      findVisibleSeasons: vi.fn().mockResolvedValue([]),
      findFinishedOfficialRounds: vi.fn().mockResolvedValue(rounds),
      findPlayerRoundStats: vi.fn().mockResolvedValue(stats),
      findEnrichmentData: vi.fn().mockResolvedValue({
        fitnessRows: [],
        cosmeticsByPlayer: new Map(),
        overallByPlayer: new Map(),
        speedByPlayer: new Map(),
        achievementBeltsByPlayer: new Map(),
      }),
      findLeaguePlayer: vi.fn().mockImplementation(async (_, __, id) => {
        if (id === "p-unranked") return { id: "p-unranked", name: "Unranked Player" };
        return null;
      }),
      findPlayerCosmetics: vi.fn().mockResolvedValue(null),
    };

    const useCase = new ManageSeasonRankingUseCase(repo);

    // Atleta com pontos no ranking
    const resP1 = await useCase.getPlayerRankingEntry(mockActor, "league-1", "p1");
    expect(resP1?.position).toBe(1);
    expect(resP1?.entry.points).toBe(7);

    // Atleta sem jogos mas pertencente à liga
    const resUnranked = await useCase.getPlayerRankingEntry(mockActor, "league-1", "p-unranked");
    expect(resUnranked?.position).toBe(2);
    expect(resUnranked?.entry.points).toBe(0);

    // Atleta desconhecido
    const resNotFound = await useCase.getPlayerRankingEntry(mockActor, "league-1", "p-unknown");
    expect(resNotFound).toBeNull();
  });

  it("getRankingEnrichmentForPlayers returns enrichment map for valid player UUIDs", async () => {
    const p1 = "11111111-1111-1111-1111-111111111111";
    const repo: SeasonRankingRepository = {
      findActiveSeason: vi.fn().mockResolvedValue({ id: "s1", number: 1, status: "active" }),
      findVisibleSeasons: vi.fn().mockResolvedValue([]),
      findFinishedOfficialRounds: vi.fn().mockResolvedValue([{ id: "r1", number: 1, date: "2026-01-01" }]),
      findPlayerRoundStats: vi.fn().mockResolvedValue([]),
      findEnrichmentData: vi.fn().mockResolvedValue({
        fitnessRows: [{ player_id: p1, distance_km: 4.5, average_speed_kmh: 9.0 }],
        cosmeticsByPlayer: new Map(),
        overallByPlayer: new Map([
          [
            p1,
            {
              overall: 78,
              trend: "steady",
              positions: null,
              positionTrends: { DEF: "steady", ALA_MEI: "steady", ATA: "steady", GOL: "steady" },
              goalkeeperGames: 0,
              goalkeeperRounds: 0,
              roundsPlayed: 1,
            },
          ],
        ]),
        speedByPlayer: new Map([[p1, 2]]),
        achievementBeltsByPlayer: new Map(),
      }),
      findLeaguePlayer: vi.fn().mockResolvedValue(null),
      findPlayerCosmetics: vi.fn().mockResolvedValue(null),
    };

    const useCase = new ManageSeasonRankingUseCase(repo);
    const enrichmentMap = await useCase.getRankingEnrichmentForPlayers(mockActor, "league-1", [p1, "invalid-id"]);

    expect(enrichmentMap[p1]).toBeDefined();
    expect(enrichmentMap[p1].overall).toBe(78);
    expect(enrichmentMap[p1].speedRating).toBe(2);
    expect(enrichmentMap[p1].fitness?.distanceKm).toBe(4.5);
    expect(enrichmentMap["invalid-id"]).toBeUndefined();
  });
});
