import { parseNewLeague, type NewLeague } from "../domain/league-creation";

export class DuplicateLeagueNameError extends Error {
  constructor() {
    super("duplicate_league_name");
    this.name = "DuplicateLeagueNameError";
  }
}

export type LeagueCreator = {
  create(league: NewLeague): Promise<string | null>;
};

export type CreateLeagueResult =
  | { status: "created"; leagueId: string }
  | { status: "invalid" }
  | { status: "duplicate" }
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
  } catch (error) {
    if (error instanceof DuplicateLeagueNameError) return { status: "duplicate" };
    return { status: "failed" };
  }
}
