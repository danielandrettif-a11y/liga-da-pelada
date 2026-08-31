import Link from "next/link";
import { redirect } from "next/navigation";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import { getCurrentAccount } from "@/lib/auth";
import { getNotificationPreferences } from "@/app/mais/notification-actions";

export default async function NotificationSettingsPage() {
  const account = await getCurrentAccount();
  if (!account.user) redirect("/login?next=/mais/notificacoes");
  const preferences = await getNotificationPreferences();
  if (!preferences) redirect("/mais");
  return <div className="space-y-5"><header><Link href="/mais" className="text-xs font-bold text-accent">← Voltar</Link><h1 className="mt-3 text-xl font-black text-foreground">Preferências de notificações</h1><p className="mt-1 text-xs text-muted">Controle os avisos de partidas e os lembretes para escalar no Cartola.</p></header><NotificationPreferencesPanel initial={preferences} isAdmin={account.isAdmin} /><PushNotificationSettings /></div>;
}
