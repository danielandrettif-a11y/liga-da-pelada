import Link from "next/link";
import { Trophy } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getFantasyRanking } from "@/lib/actions/fantasy";

export default async function FantasyRankingPage() {
  const ranking = await getFantasyRanking();
  return <div className="space-y-5"><header><Link href="/cartola" className="text-xs font-bold text-accent">← Voltar ao Cartola</Link><div className="mt-3 flex items-center gap-2"><Trophy className="h-6 w-6 text-accent"/><h1 className="text-xl font-black text-foreground">Ranking do Cartola</h1></div><p className="mt-1 text-xs text-muted">Classificação geral e patrimônio da temporada.</p></header><div className="space-y-2">{ranking.length ? ranking.map((item: any) => <div key={item.id} className="glass-card flex items-center gap-3 p-4"><span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black ${item.position <= 3 ? "bg-accent text-background" : "bg-surface text-muted"}`}>{item.position}</span><PlayerAvatar name={item.player?.name || "Cartoleiro"} avatarUrl={item.player?.avatar_url} className="h-10 w-10 rounded-full bg-surface text-xs font-black text-accent"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-foreground">{item.player?.name || "Cartoleiro"}</p><p className="text-[10px] text-muted">{item.rounds_played} rodadas · patrimônio C$ {Number(item.current_budget).toFixed(2)}</p></div><strong className="text-lg text-accent">{Number(item.total_points).toFixed(1)}</strong></div>) : <p className="glass-card p-6 text-center text-sm text-muted">O ranking aparecerá após as primeiras escalações.</p>}</div></div>;
}
