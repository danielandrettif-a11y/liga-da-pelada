import Link from "next/link";
import { getCurrentAccount, getCurrentAccountIdentity } from "@/lib/auth";
import { getMyInboxPreview } from "@/lib/actions/inbox";
import { getMyEquippedCosmetics } from "@/lib/actions/cosmetics";
import { InboxBell } from "./InboxBell";
import { ShareAppButton } from "./ShareAppButton";
import { ProfileQuickMenu } from "./ProfileQuickMenu";
import { UserRound } from "@/components/icons";

export async function SessionHeaderActions() {
  const account = await getCurrentAccount();
  const [identity, inbox, cosmetics] = await Promise.all([
    getCurrentAccountIdentity(),
    account.user ? getMyInboxPreview() : Promise.resolve([]),
    account.user ? getMyEquippedCosmetics() : Promise.resolve(null),
  ]);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <InboxBell notifications={inbox} />
      <ShareAppButton className="shadow-sm" />
      {account.user ? (
        account.profile?.player_id ? <ProfileQuickMenu playerId={account.profile.player_id} name={identity.displayName || "Perfil"} avatarUrl={identity.avatarUrl} frameKey={cosmetics?.frameKey} auraKey={cosmetics?.auraKey} /> : <Link href="/meu-perfil" className="relative block rounded-full text-xs font-black text-accent">Perfil</Link>
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
