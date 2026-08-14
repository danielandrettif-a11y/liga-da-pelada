import Link from "next/link";
import { Trophy } from "@/components/icons";
import { FantasyRankingList } from "@/components/fantasy/FantasyRankingList";
import { getFantasyRanking } from "@/lib/actions/fantasy";

export default async function FantasyRankingPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: requestedScope } = await searchParams;
  const scope = requestedScope === "round" ? "round" : "general";
  const ranking = await getFantasyRanking(scope);

  return (
    <div className="space-y-5">
      <header>
        <Link href="/cartola" className="text-xs font-bold text-accent">← Voltar ao Cartola</Link>
        <div className="mt-3 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-black text-foreground">Ranking do Cartola</h1>
        </div>
        <p className="mt-1 text-xs text-muted">Classificação exclusiva do Fantasy, sem alterar o ranking da pelada.</p>
      </header>
      <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1.5">
        <Link href="/cartola/ranking?scope=general" className={`rounded-xl px-3 py-2.5 text-center text-xs font-black ${scope === "general" ? "bg-accent text-background" : "text-muted"}`}>Geral</Link>
        <Link href="/cartola/ranking?scope=round" className={`rounded-xl px-3 py-2.5 text-center text-xs font-black ${scope === "round" ? "bg-accent text-background" : "text-muted"}`}>Rodada</Link>
      </nav>
      <FantasyRankingList ranking={ranking} />
    </div>
  );
}
