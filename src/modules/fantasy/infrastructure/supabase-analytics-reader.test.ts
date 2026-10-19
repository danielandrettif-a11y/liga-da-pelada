import { describe, expect, it, vi } from "vitest";
import {
  readFantasyPlayerDetailBase,
  readMyFantasyHistoryRows,
} from "./supabase-analytics-reader";

function query(data: unknown = []) {
  const value: any = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    order: vi.fn(() => value),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  value.then = (resolve: (result: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return value;
}

describe("supabase fantasy analytics reader", () => {
  it("isola a ficha do atleta pela pelada e temporada ativas", async () => {
    const membership = query(null);
    const price = query(null);
    const history = query([]);
    const stats = query([]);
    const profile = query(null);
    const tables: Record<string, any> = {
      league_members: membership,
      fantasy_player_prices: price,
      fantasy_player_price_history: history,
      player_round_stats: stats,
      account_profiles: profile,
    };

    await readFantasyPlayerDetailBase(
      { from: vi.fn((table: string) => tables[table]) } as any,
      { leagueId: "league-a", seasonId: "season-a", fantasySeasonId: "fantasy-a", playerId: "player-a" },
    );

    expect(membership.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(price.eq).toHaveBeenCalledWith("fantasy_season_id", "fantasy-a");
    expect(history.eq).toHaveBeenCalledWith("fantasy_season_id", "fantasy-a");
    expect(stats.eq).toHaveBeenCalledWith("round.season_id", "season-a");
  });

  it("limita o histórico pessoal à temporada do Cartola selecionada", async () => {
    const rows = query([]);
    await readMyFantasyHistoryRows({ from: vi.fn(() => rows) } as any, "user-a", "fantasy-a");
    expect(rows.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(rows.eq).toHaveBeenCalledWith("fantasy_rounds.fantasy_season_id", "fantasy-a");
  });
});
