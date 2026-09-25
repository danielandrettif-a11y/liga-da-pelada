import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { hasActiveCallup } from "@/lib/actions/callups";
import { hasReleasedPaymentRound } from "@/lib/actions/payments";
import { getRosterUnreadState } from "@/lib/actions/registrations";
import { getActiveCollectiveSummary } from "@/lib/actions/collective";

export async function SessionBottomNav() {
  // A leitura da sessão acontece primeiro para sinalizar renderização dinâmica
  // ao Next. O cache do React compartilha esta mesma consulta com o cabeçalho.
  const account = await getCurrentAccount().catch(() => ({ client: null as any, user: null, profile: null, isAdmin: false }));
  const [hasOpenCallup, hasReleasedPayment, rosterUnread, collective] = await Promise.all([
    hasActiveCallup().catch(() => false),
    account.user ? hasReleasedPaymentRound().catch(() => false) : Promise.resolve(false),
    account.isAdmin ? getRosterUnreadState().catch(() => ({ count: 0, lastSeenAt: null })) : Promise.resolve({ count: 0, lastSeenAt: null }),
    account.user ? getActiveCollectiveSummary().catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <BottomNav
      isAuthenticated={Boolean(account.user)}
      hasOpenCallup={hasOpenCallup}
      hasReleasedPayment={hasReleasedPayment}
      collective={collective ? { callupId: collective.callupId, unreadCount: collective.unreadCount } : null}
      newRosterCount={rosterUnread.count}
      currentUserId={account.user?.id || null}
    />
  );
}

