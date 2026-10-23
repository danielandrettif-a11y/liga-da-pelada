import { normalizeLeagueName } from "./league-name";

export type LeagueTier = "quick" | "basic" | "complete";
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
  if (input.tier !== "quick" && input.tier !== "basic" && input.tier !== "complete") return null;
  if (input.visibility !== "private" && input.visibility !== "open") return null;
  return {
    name,
    tier: input.tier,
    // A pelada descartável pertence somente a quem a criou. Mesmo que um
    // formulário antigo envie "open", o domínio nunca permite publicá-la.
    visibility: input.tier === "quick" ? "private" : input.visibility,
  };
}
