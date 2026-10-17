import { parseNewLeague, type NewLeague } from "../domain/league-creation";

export type LeagueCreator = {
  create(league: NewLeague): Promise<string | null>;
};

export type CreateLeagueResult =
  | { status: "created"; leagueId: string }
  | { status: "invalid" }
  | { status: "failed" };

export async function createLeagueForUser(
  input: { name: string; tier: string; visibility: string },
  creator: LeagueCreator,
): Promise<CreateLeagueResult> {
  const league = parseNewLeague(input);
  if (!league) return { status: "invalid" };
  try {
    const leagueId = await creator.create(league);
    return leagueId ? { status: "created", leagueId } : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
