import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { getActiveCallup } from "@/lib/actions/callups";
import { hasReleasedPaymentRound } from "@/lib/actions/payments";

export async function SessionBottomNav() {
  const [account, callup, hasReleasedPayment] = await Promise.all([
    getCurrentAccount(),
    getActiveCallup(),
    hasReleasedPaymentRound(),
  ]);

  return (
    <BottomNav
      isAuthenticated={Boolean(account.user)}
      hasOpenCallup={Boolean(callup)}
      hasReleasedPayment={hasReleasedPayment}
    />
  );
}
