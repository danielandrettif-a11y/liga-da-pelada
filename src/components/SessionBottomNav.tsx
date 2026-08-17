import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { getActiveCallup } from "@/lib/actions/callups";
import { hasReleasedPaymentRound } from "@/lib/actions/payments";
import { getRosterUnreadState } from "@/lib/actions/registrations";

export async function SessionBottomNav() {
  const [account, callup, hasReleasedPayment, rosterUnread] = await Promise.all([
    getCurrentAccount().catch(() => ({ client: null as any, user: null, profile: null, isAdmin: false })),
    getActiveCallup().catch(() => null),
    hasReleasedPaymentRound().catch(() => false),
    getRosterUnreadState().catch(() => ({ count: 0, lastSeenAt: null })),
  ]);

  return (
    <BottomNav
      isAuthenticated={Boolean(account.user)}
      hasOpenCallup={Boolean(callup)}
      hasReleasedPayment={hasReleasedPayment}
      newRosterCount={rosterUnread.count}
    />
  );
}

