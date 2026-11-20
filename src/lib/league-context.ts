import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentAccount, readAccountMemberships } from "@/lib/auth";

export const ACTIVE_LEAGUE_COOKIE = "active_league_id";

export type MyLeague = {
  id: string;
  name: string;
  slug: string;
  role: "admin" | "player";
  isFavorite: boolean;
  featureTier: "quick" | "basic" | "complete";
  archivedAt: string | null;
  quickPurgeAt: string | null;
  visibility: "private" | "open";
  logoUrl: string | null;
  coverUrl: string | null;
  accentColor: string;
};

export const getMyLeagues = cache(async (): Promise<MyLeague[]> => {
  const { client, user, memberships: initialMemberships, membershipError } = await getCurrentAccount();
  if (!user) return [];
  if (membershipError) throw new Error(`Não foi possível carregar suas peladas: ${membershipError.message}`);
  let memberships = initialMemberships;
  const now = Date.now();
  const hasExpiredQuickLeague = memberships.some((membership) => {
    const league = Array.isArray(membership.leagues) ? membership.leagues[0] : membership.leagues;
    return league?.feature_tier === "quick" && league.quick_purge_at && Date.parse(league.quick_purge_at) <= now;
  });
  if (hasExpiredQuickLeague) {
    // Fallback para instalações sem pg_cron. A navegação normal reaproveita os vínculos da conta.
    const cleanup = await client.rpc("cleanup_expired_quick_leagues").then((result) => result, () => null);
    if (Number(cleanup?.data || 0) > 0) {
      const refreshed = await readAccountMemberships(client, user.id);
      if (refreshed.error) throw new Error(`Não foi possível carregar suas peladas: ${refreshed.error.message}`);
      memberships = refreshed.data || [];
    }
  }

  return (memberships || []).flatMap((membership) => {
    const league = Array.isArray(membership.leagues) ? membership.leagues[0] : membership.leagues;
    if (!league?.is_active) return [];
    return [{
      id: league.id,
      name: league.name,
      slug: league.slug,
      role: membership.role === "admin" ? "admin" as const : "player" as const,
      isFavorite: Boolean(membership.is_favorite),
      featureTier: league.feature_tier === "quick" ? "quick" as const : league.feature_tier === "basic" ? "basic" as const : "complete" as const,
      archivedAt: league.archived_at || null,
      quickPurgeAt: league.quick_purge_at || null,
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
