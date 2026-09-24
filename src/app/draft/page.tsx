import Link from "next/link";
import { DraftBoard } from "@/components/DraftBoard";
import { Sparkles } from "@/components/icons";
import { getDraftWorkspaceByRound } from "@/lib/actions/draft";

export const dynamic = "force-dynamic";

export default async function DraftPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const params = await searchParams;
  const workspace = typeof params.round === "string" ? await getDraftWorkspaceByRound(params.round) : null;

  if (!workspace) {
    return <div className="flex min-h-[65vh] flex-col items-center justify-center text-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface"><Sparkles className="h-8 w-8 text-muted" /></span><h1 className="mt-4 text-xl font-black text-foreground">Draft indisponível</h1><p className="mt-2 max-w-xs text-sm text-muted">O Draft aparece aqui depois que um administrador o seleciona como modo de sorteio.</p><Link href="/admin/prelistas" className="mt-5 rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Voltar às pré-listas</Link></div>;
  }

  return <DraftBoard workspace={workspace} />;
}
