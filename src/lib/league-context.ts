import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentAccount } from "@/lib/auth";

export const ACTIVE_LEAGUE_COOKIE = "active_league_id";

export type MyLeague = {
  id: string;
  name: string;
  slug: string;
  role: "admin" | "player";
  isFavorite: boolean;
  featureTier: "basic" | "complete";
  visibility: "private" | "open";
  logoUrl: string | null;
  coverUrl: string | null;
  accentColor: string;
};

export const getMyLeagues = cache(async (): Promise<MyLeague[]> => {
  const { client, user } = await getCurrentAccount();
  if (!user) return [];

  const { data: memberships, error } = await client
    .from("league_members")
    .select("league_id, role, is_favorite, leagues!inner(id, name, slug, is_active, feature_tier, visibility, logo_url, cover_url, accent_color)")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (error) throw new Error(`Não foi possível carregar suas peladas: ${error.message}`);

  return (memberships || []).flatMap((membership) => {
    const league = Array.isArray(membership.leagues) ? membership.leagues[0] : membership.leagues;
    if (!league?.is_active) return [];
    return [{
      id: league.id,
      name: league.name,
      slug: league.slug,
      role: membership.role === "admin" ? "admin" as const : "player" as const,
      isFavorite: Boolean(membership.is_favorite),
      featureTier: league.feature_tier === "basic" ? "basic" as const : "complete" as const,
      visibility: league.visibility === "open" ? "open" as const : "private" as const,
      logoUrl: league.logo_url || null,
      coverUrl: league.cover_url || null,
      accentColor: /^#[0-9a-f]{6}$/i.test(league.accent_color || "") ? league.accent_color : "#ccff00",
    }];
  }).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name, "pt-BR"));
});

export const getSelectedLeague = cache(async (): Promise<MyLeague | null> => {
  const leagues = await getMyLeagues();
  const selectedId = (await cookies()).get(ACTIVE_LEAGUE_COOKIE)?.value;
  return leagues.find((league) => league.id === selectedId) || (leagues.length === 1 ? leagues[0] : null);
});
