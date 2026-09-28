import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { hasActiveCallup } from "@/lib/actions/callups";
import { hasPendingPaymentRound } from "@/lib/actions/payments";
import { getRosterUnreadState } from "@/lib/actions/registrations";
import { getActiveCollectiveSummary } from "@/lib/actions/collective";
import { canUseCollective } from "@/lib/collective-access";

export async function SessionBottomNav() {
  // A leitura da sessão acontece primeiro para sinalizar renderização dinâmica
  // ao Next. O cache do React compartilha esta mesma consulta com o cabeçalho.
  const account = await getCurrentAccount().catch(() => ({ client: null as any, user: null, profile: null, isAdmin: false }));
  const [hasOpenCallup, hasPendingPayment, rosterUnread, collective, linkedPlayer] = await Promise.all([
    hasActiveCallup().catch(() => false),
    account.user ? hasPendingPaymentRound().catch(() => false) : Promise.resolve(false),
    account.isAdmin ? getRosterUnreadState().catch(() => ({ count: 0, lastSeenAt: null })) : Promise.resolve({ count: 0, lastSeenAt: null }),
    account.user ? getActiveCollectiveSummary().catch(() => null) : Promise.resolve(null),
    account.profile?.player_id
      ? account.client.from("players").select("member_category").eq("id", account.profile.player_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <BottomNav
      isAuthenticated={Boolean(account.user)}
      hasOpenCallup={hasOpenCallup}
      hasPendingPayment={hasPendingPayment}
      canAccessCollective={canUseCollective(account.isAdmin, linkedPlayer.data?.member_category)}
      collective={collective ? { callupId: collective.callupId, unreadCount: collective.unreadCount } : null}
      newRosterCount={rosterUnread.count}
      currentUserId={account.user?.id || null}
    />
  );
}

