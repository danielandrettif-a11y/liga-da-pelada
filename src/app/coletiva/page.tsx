import Link from "next/link";
import { CollectiveRoom } from "@/components/CollectiveRoom";
import { Microphone } from "@/components/icons";
import { getCollectiveRoom } from "@/lib/actions/collective";

export const dynamic = "force-dynamic";

export default async function CollectivePage({ searchParams }: { searchParams: Promise<{ callup?: string }> }) {
  const params = await searchParams;
  const room = await getCollectiveRoom(typeof params.callup === "string" ? params.callup : undefined);
  if (!room) return <div className="flex min-h-[65vh] flex-col items-center justify-center text-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface"><Microphone className="h-8 w-8 text-muted" /></span><h1 className="mt-4 text-xl font-black text-foreground">Coletiva encerrada</h1><p className="mt-2 max-w-xs text-sm text-muted">A coletiva abre quando os times são definidos e permanece disponível até o último pagamento.</p><Link href="/" className="mt-5 rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Voltar ao início</Link></div>;
  return <CollectiveRoom room={room} />;
}
