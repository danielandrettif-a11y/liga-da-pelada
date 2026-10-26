"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { ACTIVE_LEAGUE_COOKIE } from "@/lib/league-context";
import {
  ENTRY_FLOW_DONE_COOKIE,
  ENTRY_FLOW_PENDING_COOKIE,
  ENTRY_FLOW_VERSION,
  safeEntryDestination,
} from "@/lib/entry-flow";
import { createLeagueForUser } from "@/modules/leagues/application/create-league";
import { supabaseLeagueCreator } from "@/modules/leagues/infrastructure/supabase-league-creator";
import { asLeagueCreator } from "@/modules/leagues/infrastructure/http-league-gateway";
import { leagueApiFor } from "@/modules/leagues/infrastructure/league-api-session";

async function completePendingEntryFlow(client: any) {
  const cookieStore = await cookies();
  const pending = cookieStore.get(ENTRY_FLOW_PENDING_COOKIE)?.value;
  if (!pending) return null;
  const { error } = await client.rpc("complete_my_entry_flow", { p_version: ENTRY_FLOW_VERSION });
  if (error) throw new Error(error.message);
  cookieStore.set(ENTRY_FLOW_DONE_COOKIE, String(ENTRY_FLOW_VERSION), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.delete(ENTRY_FLOW_PENDING_COOKIE);
  return safeEntryDestination(pending);
}

export async function continueEntryFlow() {
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  const destination = await completePendingEntryFlow(client);
  revalidatePath("/", "layout");
  redirect(destination || "/");
}

export async function enterLeague(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const { client, user, memberships } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  if (!memberships.some((membership) => membership.league_id === leagueId)) {
    redirect("/lobby?error=access");
  }
  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, leagueId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  const destination = await completePendingEntryFlow(client);
  redirect(destination || "/");
}

export async function enterArchivedQuickLeague(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const { user, memberships } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  if (!memberships.some((membership) => membership.league_id === leagueId)) {
    redirect("/lobby?error=access");
  }
  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, leagueId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/rodadas");
}

export async function toggleFavorite(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const favorite = formData.get("favorite") === "true";
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  try {
    const api = await leagueApiFor(client);
    if (api) {
      await api.setFavorite(leagueId, favorite);
    } else {
      const { error } = await client.rpc("toggle_league_favorite", { p_league_id: leagueId });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect("/lobby?error=favorite");
  }
  revalidatePath("/lobby");
}

export async function requestAccess(formData: FormData) {
  const token = String(formData.get("token") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/convite/${token}`)}`);
  try {
    const api = await leagueApiFor(client);
    if (api) {
      await api.requestByInvite(token);
    } else {
      const { error } = await client.rpc("request_league_membership", { p_invite_token: token });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect(`/convite/${encodeURIComponent(token)}?error=request`);
  }
  revalidatePath(`/convite/${token}`);
  redirect(`/convite/${encodeURIComponent(token)}?sent=1`);
}

export async function reviewAccess(formData: FormData) {
  const requestId = String(formData.get("request_id") || "");
  const approve = formData.get("decision") === "approve";
  const requestedReturnTo = String(formData.get("return_to") || "/lobby");
  const returnTo = ["/", "/convocacao", "/lobby"].includes(requestedReturnTo)
    ? requestedReturnTo
    : "/lobby";
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  try {
    const api = await leagueApiFor(client);
    if (api) {
      await api.reviewMembership(requestId, approve);
    } else {
      const { error } = await client.rpc("review_league_membership", { p_request_id: requestId, p_approve: approve });
      if (error) throw new Error(error.message);
    }
  } catch {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}${returnTo === "/lobby" ? "error" : "inviteError"}=review`);
  }
  revalidatePath("/lobby");
  revalidatePath("/");
  revalidatePath("/convocacao");
}

export async function addExistingAccount(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const userId = String(formData.get("user_id") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  try {
    const api = await leagueApiFor(client);
    if (api) {
      await api.addExistingAccount(leagueId, userId);
    } else {
      const { error } = await client.rpc("add_account_to_league", { p_league_id: leagueId, p_user_id: userId });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect("/lobby?error=add");
  }
  revalidatePath("/lobby");
  redirect("/lobby?added=1");
}

export async function joinOpenLeague(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/peladas");
  try {
    const api = await leagueApiFor(client);
    if (api) {
      await api.joinOpen(leagueId);
    } else {
      const { error } = await client.rpc("join_open_league", { p_league_id: leagueId });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect("/peladas?error=join");
  }
  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, leagueId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  const destination = await completePendingEntryFlow(client);
  revalidatePath("/peladas");
  revalidatePath("/lobby");
  revalidatePath("/", "layout");
  redirect(destination || "/");
}

export async function requestClosedLeague(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/peladas");
  try {
    const api = await leagueApiFor(client);
    if (api) {
      await api.requestMembership(leagueId);
    } else {
      const { error } = await client.rpc("request_league_membership_by_id", { p_league_id: leagueId });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect("/peladas?error=request");
  }
  await completePendingEntryFlow(client);
  revalidatePath("/peladas");
  revalidatePath("/lobby");
  redirect("/peladas?requested=1");
}

export async function createLeague(formData: FormData) {
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  let creator = supabaseLeagueCreator(client);
  try {
    const api = await leagueApiFor(client);
    if (api) creator = asLeagueCreator(api);
  } catch {
    redirect("/lobby/criar?error=create");
  }
  const result = await createLeagueForUser({
    name: String(formData.get("name") || ""),
    tier: String(formData.get("tier") || ""),
    visibility: String(formData.get("visibility") || ""),
  }, creator);
  if (result.status === "invalid") redirect("/lobby/criar?error=invalid");
  if (result.status === "duplicate") redirect("/lobby/criar?error=duplicate");
  if (result.status === "failed") redirect("/lobby/criar?error=create");
  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, result.leagueId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  const destination = await completePendingEntryFlow(client);
  revalidatePath("/", "layout");
  redirect(destination || (String(formData.get("tier")) === "quick" ? "/rodadas?create=1" : "/"));
}

export async function createQuickLeague(formData: FormData) {
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");

  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("start_time") || "").slice(0, 5);
  const fieldName = String(formData.get("field_name") || "").trim().replace(/\s+/g, " ");
  let mapUrl = String(formData.get("map_url") || "").trim();
  if (mapUrl && !/^https?:\/\//i.test(mapUrl)) mapUrl = `https://${mapUrl}`;
  let validUrl = true;
  if (mapUrl) {
    try {
      const parsed = new URL(mapUrl);
      validUrl = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      validUrl = false;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)
    || (fieldName.length > 0 && (fieldName.length < 2 || fieldName.length > 80)) || !validUrl) {
    redirect("/lobby/criar?quickError=invalid");
  }

  const { data, error } = await client.rpc("create_quick_match_session", {
    p_date: date,
    p_start_time: startTime,
    p_field_name: fieldName,
    p_map_url: mapUrl,
    p_players_per_team: 5,
    p_teams_per_round: 3,
  });
  const session = data as { league_id?: string; callup_id?: string; round_id?: string } | null;
  if (error || !session?.league_id || !session.callup_id || !session.round_id) {
    console.error("Erro ao criar partida rápida:", error);
    redirect("/lobby/criar?quickError=create");
  }

  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, session.league_id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect(`/convocacao?callup=${encodeURIComponent(session.callup_id)}&setup=players`);
}
