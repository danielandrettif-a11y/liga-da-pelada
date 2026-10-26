import { describe, expect, it } from "vitest";
import { buildAccountCareer, zeroCareerTotals, type AccountCareerRow } from "./account-career.js";

const row = (roundType: "official" | "friendly", goals: number): AccountCareerRow => ({
  league_id: `league-${roundType}`,
  league_name: `Pelada ${roundType}`,
  round_type: roundType,
  rounds_count: 1,
  games: 2,
  goals,
  assists: 1,
  wins: 1,
  draws: 0,
  losses: 1,
  points: 3.5,
  goalkeeper_games: 0,
  goals_conceded: 0,
  clean_sheets: 0,
  play_seconds: 600,
});

describe("account career", () => {
  it("aggregates overall and round-type totals without mutating rows", () => {
    const rows = [row("official", 2), row("friendly", 1)];
    const career = buildAccountCareer(rows);
    expect(career.overall).toMatchObject({ rounds_count: 2, games: 4, goals: 3, points: 7, play_seconds: 1200 });
    expect(career.official.goals).toBe(2);
    expect(career.friendly.goals).toBe(1);
    expect(career.rows).not.toBe(rows);
  });

  it("returns complete zero totals for an empty career", () => {
    expect(buildAccountCareer([])).toEqual({
      rows: [], overall: zeroCareerTotals(), official: zeroCareerTotals(), friendly: zeroCareerTotals(),
    });
  });
});
