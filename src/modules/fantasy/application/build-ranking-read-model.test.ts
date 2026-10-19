import { describe, expect, it } from "vitest";
import { assignFantasyRankingPositions, buildSeasonFantasyRanking } from "./build-ranking-read-model";

describe("read model do ranking do Cartola", () => {
  it("combina histórico e prévia ao vivo sem duplicar o usuário", () => {
    const [entry] = buildSeasonFantasyRanking({
      accounts: [{ id: "account-1", user_id: "user-1", current_budget: 105 }],
      scoredLineups: [{
        user_id: "user-1",
        total_points: 20,
        fantasy_lineup_players: [
          { slot_role: "DEF", total_points: 8, captain_bonus: 2 },
          { slot_role: "ATA", total_points: 12, captain_bonus: 0 },
        ],
      }],
      liveProjections: [{
        userId: "user-1",
        totalPoints: 10,
        captainBonus: 1,
        players: [{ slotRole: "ATA", totalPoints: 10 }],
      }],
    });
    expect(entry).toMatchObject({
      total_points: 30,
      rounds_played: 1,
      best_round_points: 20,
      captain_bonus_points: 3,
      def_points: 8,
      attack_points: 22,
      attack_selection_count: 2,
      attack_average_points: 11,
      current_budget: 105,
      is_live: true,
    });
  });

  it("inclui usuário presente apenas na projeção ao vivo", () => {
    const [entry] = buildSeasonFantasyRanking({
      accounts: [],
      scoredLineups: [],
      liveProjections: [{ userId: "new-user", lineupId: "lineup-1", totalPoints: 7 }],
    });
    expect(entry).toMatchObject({ id: "lineup-1", user_id: "new-user", total_points: 7, rounds_played: 0 });
  });

  it("atribui a mesma posição em caso de empate", () => {
    expect(assignFantasyRankingPositions([
      { id: "a", total_points: 10 },
      { id: "b", total_points: 20 },
      { id: "c", total_points: 10 },
    ])).toEqual([
      { id: "b", total_points: 20, position: 1 },
      { id: "a", total_points: 10, position: 2 },
      { id: "c", total_points: 10, position: 2 },
    ]);
  });
});
