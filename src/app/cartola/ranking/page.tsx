import Link from "next/link";
import { Trophy } from "@/components/icons";
import { FantasyRankingList } from "@/components/fantasy/FantasyRankingList";
import { getFantasyRanking, getFantasyRoundLineupOverview } from "@/lib/actions/fantasy";

// A classificação muda a cada scout da rodada e depende da sessão atual.
// Nunca reutilize a resposta vazia de outro acesso/navegação.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FantasyRankingPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: requestedScope } = await searchParams;
  const scope = requestedScope === "month" ? "month" : requestedScope === "season" || requestedScope === "general" ? "season" : "round";
  const [ranking, roundOverview] = await Promise.all([
    getFantasyRanking(scope),
    scope === "round" ? getFantasyRoundLineupOverview() : Promise.resolve(null),
  ]);

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
      <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-1.5">
        <Link href="/cartola/ranking?scope=round" className={`rounded-xl px-3 py-2.5 text-center text-xs font-black ${scope === "round" ? "bg-accent text-background" : "text-muted"}`}>Rodada</Link>
        <Link href="/cartola/ranking?scope=month" className={`rounded-xl px-3 py-2.5 text-center text-xs font-black ${scope === "month" ? "bg-accent text-background" : "text-muted"}`}>Mês</Link>
        <Link href="/cartola/ranking?scope=season" className={`rounded-xl px-3 py-2.5 text-center text-xs font-black ${scope === "season" ? "bg-accent text-background" : "text-muted"}`}>Temporada</Link>
      </nav>
      <FantasyRankingList ranking={ranking} roundOverview={roundOverview} scope={scope} />
    </div>
  );
}
