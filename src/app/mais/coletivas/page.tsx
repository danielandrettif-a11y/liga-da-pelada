import { CollectiveRoom } from "@/components/CollectiveRoom";
import { Microphone } from "@/components/icons";
import { getAdminPreviousCollective } from "@/lib/actions/collective";
import { getCurrentAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CollectiveArchivePage() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return <div className="rounded-3xl border border-danger/30 bg-danger/10 p-6 text-center text-sm font-bold text-danger">Acesso exclusivo para administradores.</div>;
  const room = await getAdminPreviousCollective();
  if (!room) return <div className="flex min-h-[60vh] flex-col items-center justify-center text-center"><Microphone className="h-10 w-10 text-muted" /><h1 className="mt-4 text-xl font-black text-foreground">Nenhuma coletiva arquivada</h1><p className="mt-2 text-sm text-muted">A conversa da última rodada finalizada aparecerá aqui.</p></div>;
  return <div className="space-y-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-accent">Arquivo administrativo</p><h1 className="text-xl font-black text-foreground">Última coletiva</h1></div><CollectiveRoom room={room} /></div>;
}
