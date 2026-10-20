import { normalizeLeagueName } from "./league-name";

export type LeagueTier = "basic" | "complete";
export type LeagueVisibility = "private" | "open";

export type NewLeague = {
  name: string;
  tier: LeagueTier;
  visibility: LeagueVisibility;
};

export function parseNewLeague(input: {
  name: string;
  tier: string;
  visibility: string;
}): NewLeague | null {
  const name = normalizeLeagueName(input.name);
  if (name.length < 3 || name.length > 80) return null;
  if (input.tier !== "basic" && input.tier !== "complete") return null;
  if (input.visibility !== "private" && input.visibility !== "open") return null;
  return { name, tier: input.tier, visibility: input.visibility };
}
