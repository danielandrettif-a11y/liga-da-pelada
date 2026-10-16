"use server";

import { getCurrentAccount } from "@/lib/auth";

export type AccountCareerRow = {
  league_id: string;
  league_name: string;
  round_type: "official" | "friendly";
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

const zeroTotals = (): CareerTotals => ({ rounds_count: 0, games: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, points: 0, goalkeeper_games: 0, goals_conceded: 0, clean_sheets: 0, play_seconds: 0 });

function sum(rows: AccountCareerRow[]): CareerTotals {
  return rows.reduce((total, row) => {
    for (const key of Object.keys(total) as Array<keyof CareerTotals>) total[key] += Number(row[key] || 0);
    return total;
  }, zeroTotals());
}

export async function getMyAccountCareer() {
  const account = await getCurrentAccount();
  if (!account.user) return { rows: [], overall: zeroTotals(), official: zeroTotals(), friendly: zeroTotals() };
  const { data, error } = await account.client.rpc("get_my_account_career_stats");
  if (error) return { rows: [], overall: zeroTotals(), official: zeroTotals(), friendly: zeroTotals() };
  const rows = (data || []) as AccountCareerRow[];
  return { rows, overall: sum(rows), official: sum(rows.filter((row) => row.round_type === "official")), friendly: sum(rows.filter((row) => row.round_type === "friendly")) };
}
