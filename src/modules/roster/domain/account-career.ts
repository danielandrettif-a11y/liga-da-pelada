export type CareerRoundType = "official" | "friendly";

export type AccountCareerRow = {
  league_id: string;
  league_name: string;
  round_type: CareerRoundType;
  rounds_count: number;
  games: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalkeeper_games: number;
  goals_conceded: number;
  clean_sheets: number;
  play_seconds: number;
};

export type CareerTotals = Omit<AccountCareerRow, "league_id" | "league_name" | "round_type">;

export type AccountCareer = {
  rows: AccountCareerRow[];
  overall: CareerTotals;
  official: CareerTotals;
  friendly: CareerTotals;
};

const fields = [
  "rounds_count", "games", "goals", "assists", "wins", "draws", "losses", "points",
  "goalkeeper_games", "goals_conceded", "clean_sheets", "play_seconds",
] as const satisfies readonly (keyof CareerTotals)[];

export function zeroCareerTotals(): CareerTotals {
  return {
    rounds_count: 0, games: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, points: 0,
    goalkeeper_games: 0, goals_conceded: 0, clean_sheets: 0, play_seconds: 0,
  };
}

export function sumCareer(rows: readonly AccountCareerRow[]): CareerTotals {
  return rows.reduce((totals, row) => {
    for (const field of fields) totals[field] += Number(row[field] || 0);
    return totals;
  }, zeroCareerTotals());
}

export function emptyAccountCareer(): AccountCareer {
  return { rows: [], overall: zeroCareerTotals(), official: zeroCareerTotals(), friendly: zeroCareerTotals() };
}
