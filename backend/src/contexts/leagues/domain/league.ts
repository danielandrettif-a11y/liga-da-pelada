export type LeagueTier = "quick" | "basic" | "complete";
export type LeagueVisibility = "private" | "open";

export type NewLeague = {
  name: string;
  tier: LeagueTier;
  visibility: LeagueVisibility;
};

export class InvalidLeagueError extends Error {
  constructor() {
    super("Nome, modo ou visibilidade inválidos.");
    this.name = "InvalidLeagueError";
  }
}

/** Mesma regra de criação aplicada atualmente em src/modules/leagues/domain. */
export function parseNewLeague(input: { name: string; tier: string; visibility: string }): NewLeague {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) throw new InvalidLeagueError();
  if (input.tier !== "quick" && input.tier !== "basic" && input.tier !== "complete") throw new InvalidLeagueError();
  if (input.visibility !== "private" && input.visibility !== "open") throw new InvalidLeagueError();
  return {
    name,
    tier: input.tier,
    visibility: input.tier === "quick" ? "private" : input.visibility,
  };
}
