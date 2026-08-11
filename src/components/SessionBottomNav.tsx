import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { getActiveCallup } from "@/lib/actions/callups";

export async function SessionBottomNav() {
  const [account, callup] = await Promise.all([getCurrentAccount(), getActiveCallup()]);

  return <BottomNav isAuthenticated={Boolean(account.user)} hasOpenCallup={Boolean(callup)} />;
}
