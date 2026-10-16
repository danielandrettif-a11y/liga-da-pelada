"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { ACTIVE_LEAGUE_COOKIE, getMyLeagues } from "@/lib/league-context";
import {
  ENTRY_FLOW_DONE_COOKIE,
  ENTRY_FLOW_PENDING_COOKIE,
  ENTRY_FLOW_VERSION,
  safeEntryDestination,
} from "@/lib/entry-flow";

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
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  const league = (await getMyLeagues()).find((item) => item.id === leagueId);
  if (!league) redirect("/lobby?error=access");
  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, league.id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  const destination = await completePendingEntryFlow(client);
  revalidatePath("/", "layout");
  redirect(destination || "/");
}

export async function toggleFavorite(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  const { error } = await client.rpc("toggle_league_favorite", { p_league_id: leagueId });
  if (error) redirect("/lobby?error=favorite");
  revalidatePath("/lobby");
}

export async function requestAccess(formData: FormData) {
  const token = String(formData.get("token") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/convite/${token}`)}`);
  const { error } = await client.rpc("request_league_membership", { p_invite_token: token });
  if (error) redirect(`/convite/${encodeURIComponent(token)}?error=request`);
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
  const { error } = await client.rpc("review_league_membership", { p_request_id: requestId, p_approve: approve });
  if (error) {
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
  const { error } = await client.rpc("add_account_to_league", { p_league_id: leagueId, p_user_id: userId });
  if (error) redirect("/lobby?error=add");
  revalidatePath("/lobby");
  redirect("/lobby?added=1");
}

export async function joinOpenLeague(formData: FormData) {
  const leagueId = String(formData.get("league_id") || "");
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/peladas");
  const { error } = await client.rpc("join_open_league", { p_league_id: leagueId });
  if (error) redirect("/peladas?error=join");
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
  const { error } = await client.rpc("request_league_membership_by_id", {
    p_league_id: leagueId,
  });
  if (error) redirect("/peladas?error=request");
  await completePendingEntryFlow(client);
  revalidatePath("/peladas");
  revalidatePath("/lobby");
  redirect("/peladas?requested=1");
}

export async function createLeague(formData: FormData) {
  const { client, user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  const name = String(formData.get("name") || "").trim().replace(/\s+/g, " ");
  const tier = String(formData.get("tier") || "");
  const visibility = String(formData.get("visibility") || "");
  if (name.length < 3 || name.length > 80 || !["basic", "complete"].includes(tier)
    || !["private", "open"].includes(visibility)) {
    redirect("/lobby/criar?error=invalid");
  }
  const { data: leagueId, error } = await client.rpc("create_league_for_user", {
    p_name: name,
    p_tier: tier,
    p_visibility: visibility,
  });
  if (error || !leagueId) redirect("/lobby/criar?error=create");
  (await cookies()).set(ACTIVE_LEAGUE_COOKIE, String(leagueId), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  const destination = await completePendingEntryFlow(client);
  revalidatePath("/", "layout");
  redirect(destination || "/");
}
