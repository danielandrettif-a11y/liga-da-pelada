import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";

export async function SessionBottomNav() {
  const account = await getCurrentAccount();

  return <BottomNav isAuthenticated={Boolean(account.user)} />;
}
