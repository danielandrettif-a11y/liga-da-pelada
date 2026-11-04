import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { readLiveFantasyProjection } from "./pg-live-fantasy-projection.js";

describe("Infrastructure: live fantasy projection", () => {
  it("rebuilds lineups from match events with the canonical domain engine", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) return { rows: [{
        id: "fantasy-round-1", round_id: "round-1", market_status: "in_progress",
        scoring_version: 14, settings_snapshot: {}, status: "in_progress",
        suppress_goalkeeper_rewards: false, date: "2026-01-01", number: 1,
      }] };
      if (sql.includes("FROM public.fantasy_settings")) return { rows: [{}] };
      if (sql.includes("FROM public.fantasy_lineups lineup")) return { rows: [{
        id: "lineup-1", user_id: "user-1", status: "saved", score_breakdown: {},
        captain_player_id: "player-1", top_scorer_player_id: "player-1", top_assist_player_id: null,
        players: [{ player_id: "player-1", slot_role: "ATA", player_profile_locked: "offensive" }],
        reserves: [],
      }] };
      if (sql.includes("FROM public.league_members member")) return { rows: [{
        player_id: "player-1", player_profile: "offensive", member_category: "player", is_selectable: true,
      }] };
      if (sql.includes("FROM public.matches")) return { rows: [{
        id: "match-1", status: "finished", team_a_id: "team-a", team_b_id: "team-b",
        score_a: 1, score_b: 0, duration_seconds: 600, timer_accumulated_seconds: 600,
        eligibility_elapsed_offset_seconds: 0, timer_started_at: null,
      }] };
      if (sql.includes("FROM public.match_events")) return { rows: [{
        match_id: "match-1", player_id: "player-1", assist_player_id: null,
        team_id: "team-a", is_own_goal: false,
      }] };
      if (sql.includes("FROM public.match_players")) return { rows: [{
        match_id: "match-1", player_id: "player-1", team_id: "team-a",
        result_eligible: true, scoring_eligible: true,
      }] };
      return { rows: [] };
    });
    const client = { query } as unknown as PoolClient;

    const result = await readLiveFantasyProjection(client, {
      leagueId: "league-1", fantasySeasonId: "season-1", targetRoundId: "round-1",
    });

    expect(result?.roundId).toBe("round-1");
    expect(result?.isLive).toBe(true);
    expect(result?.statsByPlayer.get("player-1")).toMatchObject({ goals: 1, wins: 1 });
    expect(result?.byUserId.get("user-1")?.players[0]).toMatchObject({
      playerId: "player-1", slotRole: "ATA",
    });
    expect(Number(result?.byUserId.get("user-1")?.totalPoints)).toBeGreaterThan(0);
    expect(query.mock.calls.find(([sql]) => String(sql).includes("match_events"))?.[0]).toContain("event_type='goal'");
  });

  it("returns null when no matching fantasy round exists", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
    await expect(readLiveFantasyProjection(client, {
      leagueId: "league-1", fantasySeasonId: "season-1",
    })).resolves.toBeNull();
  });
});
