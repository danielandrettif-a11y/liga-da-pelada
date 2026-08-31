import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { InboxCard } from "@/components/InboxCard";
import { getMyInboxNotifications } from "@/lib/actions/inbox";

export default async function NotificationsPage() {
  const notifications = await getMyInboxNotifications();
  return <div className="space-y-5"><header className="flex items-center gap-3"><Link href="/" className="rounded-full bg-surface p-2"><ArrowLeft className="h-5 w-5 text-muted" /></Link><div><h1 className="text-xl font-black text-foreground">Histórico de avisos</h1><p className="text-xs text-muted">Pendências e avisos já resolvidos.</p></div></header><InboxCard notifications={notifications} showAll /></div>;
}
