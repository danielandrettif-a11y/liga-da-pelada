import { getCurrentAccount } from "@/lib/auth";
import { InstallAppPrompt } from "@/components/InstallAppPrompt";

export async function SessionInstallAppPrompt() {
  const account = await getCurrentAccount();
  if (!account.user) return null;

  const isProfileReady = account.isAdmin || Boolean(account.profile?.player_id);
  return <InstallAppPrompt key={account.user.id} userId={account.user.id} isProfileReady={isProfileReady} />;
}
