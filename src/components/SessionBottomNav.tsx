import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { getActiveCallup } from "@/lib/actions/callups";
import { hasReleasedPaymentRound } from "@/lib/actions/payments";
import { getRosterUnreadState } from "@/lib/actions/registrations";

export async function SessionBottomNav() {
  const [account, callup, hasReleasedPayment, rosterUnread] = await Promise.all([
    getCurrentAccount(),
    getActiveCallup(),
    hasReleasedPaymentRound(),
    getRosterUnreadState(),
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
