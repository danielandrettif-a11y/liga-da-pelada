import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { cookies } from "next/headers";

export type AccountRole = "admin" | "player";

export type AccountProfile = {
  user_id: string;
  role: AccountRole;
  player_id: string | null;
  account_tag?: string | null;
  created_at: string;
  updated_at: string;
};

export const getCurrentAccount = cache(async function getCurrentAccount() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();

  if (!user) {
    return { client, user: null, profile: null, memberships: [], isAdmin: false };
  }

  // Perfil, vínculos e cookie não dependem uns dos outros. Executá-los em
  // paralelo evita duas esperas de rede consecutivas em toda navegação.
  const [{ data: profile }, { data: memberships }, cookieStore] = await Promise.all([
    client
      .from("account_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("league_members")
      .select("league_id, role")
      .eq("user_id", user.id)
      .eq("is_active", true),
    cookies(),
  ]);
  const selectedLeagueId = cookieStore.get("active_league_id")?.value;
  const selectedMembership = memberships?.find((membership) => membership.league_id === selectedLeagueId)
    || (memberships?.length === 1 ? memberships[0] : null);

  return {
    client,
    user,
    profile: profile as AccountProfile | null,
    memberships: memberships || [],
    isAdmin: selectedMembership?.role === "admin",
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

  // Contas ainda não vinculadas não devem provocar uma varredura da tabela
  // inteira de jogadores em toda navegação. Além de ser mais rápido, o nome do
  // e-mail/Google é a fonte correta até o vínculo oficial ser concluído.
  const emailPrefix = account.user.email?.split("@")[0] || "";
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
