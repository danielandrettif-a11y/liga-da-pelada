import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

export type AccountRole = "admin" | "player";

export type AccountProfile = {
  user_id: string;
  role: AccountRole;
  player_id: string | null;
  created_at: string;
  updated_at: string;
};

export const getCurrentAccount = cache(async function getCurrentAccount() {
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
});

export type AccountIdentity = {
  displayName: string | null;
  avatarUrl: string | null;
};

// Nome e avatar aparecem no cabeçalho e em várias páginas. Centralizar a
// leitura evita consultar o mesmo jogador mais de uma vez durante o mesmo
// render do Next, sem manter dados pessoais em cache entre requisições.
export const getCurrentAccountIdentity = cache(async function getCurrentAccountIdentity(): Promise<AccountIdentity> {
  const account = await getCurrentAccount();
  if (!account.user) return { displayName: null, avatarUrl: null };

  if (account.profile?.player_id) {
    const { data: player } = await account.client
      .from("players")
      .select("name, nickname, avatar_url")
      .eq("id", account.profile.player_id)
      .maybeSingle();

    if (player?.name) {
      return {
        displayName: player.name.trim().split(/\s+/)[0],
        avatarUrl: player.avatar_url || null,
      };
    }
  }

  const metadataName = account.user.user_metadata?.name
    || account.user.user_metadata?.full_name
    || account.user.user_metadata?.display_name;
  const metadataAvatar = account.user.user_metadata?.avatar_url
    || account.user.user_metadata?.picture
    || null;

  if (metadataName) {
    return {
      displayName: String(metadataName).trim().split(/\s+/)[0],
      avatarUrl: metadataAvatar,
    };
  }

  const emailPrefix = account.user.email?.split("@")[0] || "";
  const normalize = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const normalizedEmail = normalize(emailPrefix);

  if (normalizedEmail.length >= 4) {
    const { data: players } = await account.client
      .from("players")
      .select("name, nickname, avatar_url");
    const matchedPlayer = players?.find((player) => {
      const candidates = [player.name, player.nickname]
        .filter(Boolean)
        .map((name) => normalize(String(name)));
      return candidates.some((candidate) => candidate.length >= 4
        && (normalizedEmail.startsWith(candidate) || candidate.startsWith(normalizedEmail)));
    });
    if (matchedPlayer) {
      return {
        displayName: matchedPlayer.name.trim().split(/\s+/)[0],
        avatarUrl: matchedPlayer.avatar_url || metadataAvatar,
      };
    }
  }

  const emailName = emailPrefix.split(/[._-]/)[0] || "Jogador";
  return {
    displayName: emailName.charAt(0).toUpperCase() + emailName.slice(1),
    avatarUrl: metadataAvatar,
  };
});

export async function getAdminClient() {
  const account = await getCurrentAccount();
  return account.isAdmin ? account.client : null;
}

export async function getAccountDisplayName(
  account: Awaited<ReturnType<typeof getCurrentAccount>>,
) {
  if (!account.user) return null;
  return (await getCurrentAccountIdentity()).displayName;
}
