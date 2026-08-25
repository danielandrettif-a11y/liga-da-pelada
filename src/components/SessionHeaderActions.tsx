import Link from "next/link";
import { getCurrentAccount, getAccountDisplayName } from "@/lib/auth";
import { getMyInboxNotifications } from "@/lib/actions/inbox";
import { getMyEquippedCosmetics } from "@/lib/actions/cosmetics";
import { InboxBell } from "./InboxBell";
import { ShareAppButton } from "./ShareAppButton";
import { PlayerAvatar } from "./PlayerAvatar";
import { UserRound } from "@/components/icons";

export async function SessionHeaderActions() {
  const account = await getCurrentAccount();
  const [name, inbox, cosmetics] = await Promise.all([
    getAccountDisplayName(account),
    account.user ? getMyInboxNotifications() : Promise.resolve([]),
    account.user ? getMyEquippedCosmetics() : Promise.resolve(null),
  ]);

  let avatarUrl: string | null = null;
  if (account.profile?.player_id) {
    const { data: player } = await account.client
      .from("players")
      .select("avatar_url")
      .eq("id", account.profile.player_id)
      .maybeSingle();
    avatarUrl = player?.avatar_url || null;
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <InboxBell notifications={inbox} />
      <ShareAppButton className="shadow-sm" />
      {account.user ? (
        <Link
          href="/meu-perfil"
          className="relative block rounded-full transition-transform active:scale-95"
          aria-label="Abrir meu perfil"
          title={name || "Meu Perfil"}
        >
          <PlayerAvatar
            name={name || "Perfil"}
            avatarUrl={avatarUrl}
            clickable={false}
            frameKey={cosmetics?.frameKey}
            auraKey={cosmetics?.auraKey}
            className="h-10 w-10 rounded-full border border-accent/30 bg-surface/90 text-xs font-black text-accent"
          />
        </Link>
      ) : (
        <Link
          href="/login"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-surface/80 text-muted hover:border-accent/40 hover:text-accent transition-all active:scale-95 shadow-sm"
          aria-label="Fazer login"
          title="Fazer Login"
        >
          <UserRound className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
