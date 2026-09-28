import Link from "next/link";
import { CollectiveRoom } from "@/components/CollectiveRoom";
import { Microphone } from "@/components/icons";
import { getCollectiveHistory, getCollectiveRoom } from "@/lib/actions/collective";

export const dynamic = "force-dynamic";

export default async function CollectivePage({ searchParams }: { searchParams: Promise<{ callup?: string }> }) {
  const params = await searchParams;
  const history = await getCollectiveHistory();
  const requestedCallupId = typeof params.callup === "string" ? params.callup : history[0]?.callupId;
  const room = requestedCallupId ? await getCollectiveRoom(requestedCallupId) : null;
  if (!room) return <div className="flex min-h-[65vh] flex-col items-center justify-center text-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface"><Microphone className="h-8 w-8 text-muted" /></span><h1 className="mt-4 text-xl font-black text-foreground">Nenhuma coletiva recente</h1><p className="mt-2 max-w-xs text-sm text-muted">As conversas das duas últimas semanas aparecem aqui quando os times são definidos.</p><Link href="/" className="mt-5 rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Voltar ao início</Link></div>;
  return <div className="space-y-3">
    {history.length > 1 && <nav aria-label="Histórico da Coletiva" className="flex gap-2 overflow-x-auto pb-1">
      {history.map((item) => <Link key={item.callupId} href={`/coletiva?callup=${item.callupId}`} className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black ${item.callupId === room.summary.callupId ? "border-accent bg-accent text-background" : "border-border bg-surface text-muted"}`}>Rodada {item.roundNumber ? String(item.roundNumber).padStart(2, "0") : new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")}</Link>)}
    </nav>}
    <CollectiveRoom room={room} />
  </div>;
}
