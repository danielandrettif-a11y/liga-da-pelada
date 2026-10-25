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

export class InvalidLeagueIdError extends Error {
  constructor() {
    super("Pelada inválida.");
    this.name = "InvalidLeagueIdError";
  }
}

export function parseLeagueId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InvalidLeagueIdError();
  }
  return value.toLowerCase();
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
