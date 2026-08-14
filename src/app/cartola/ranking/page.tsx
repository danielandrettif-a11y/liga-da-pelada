import Link from "next/link";
import { Trophy } from "@/components/icons";
import { FantasyRankingList } from "@/components/fantasy/FantasyRankingList";
import { getFantasyRanking } from "@/lib/actions/fantasy";

export default async function FantasyRankingPage() {
  const ranking = await getFantasyRanking();

  return (
    <div className="space-y-5">
      <header>
        <Link href="/cartola" className="text-xs font-bold text-accent">← Voltar ao Cartola</Link>
        <div className="mt-3 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-black text-foreground">Ranking do Cartola</h1>
        </div>
        <p className="mt-1 text-xs text-muted">Classificação geral e patrimônio da temporada.</p>
      </header>
      <FantasyRankingList ranking={ranking} />
    </div>
  );
}
