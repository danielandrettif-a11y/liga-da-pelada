import { createClient } from "@/lib/supabase/server";

export type AccountRole = "admin" | "player";

export type AccountProfile = {
  user_id: string;
  role: AccountRole;
  player_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCurrentAccount() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();

  if (!user) {
    return { client, user: null, profile: null, isAdmin: false };
  }

  const { data: profile } = await client
    .from("account_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    client,
    user,
    profile: profile as AccountProfile | null,
    isAdmin: profile?.role === "admin",
  };
}

export async function getAdminClient() {
  const account = await getCurrentAccount();
  return account.isAdmin ? account.client : null;
}
