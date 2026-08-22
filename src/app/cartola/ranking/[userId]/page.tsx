import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getFantasyUserHistory } from "@/lib/actions/fantasy";

export default async function FantasyUserHistoryPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const data = await getFantasyUserHistory(userId);
  if (!data) notFound();
  const name = (data.player as any)?.name || "Cartoleiro";
  const avatarUrl = (data.player as any)?.avatar_url || null;
  return (
    <div className="space-y-5">
      <header><Link href="/cartola/ranking" className="text-xs font-bold text-accent">← Voltar ao ranking</Link><div className="mt-4 flex items-center gap-3"><PlayerAvatar name={name} avatarUrl={avatarUrl} className="h-14 w-14 rounded-full bg-surface text-base font-black text-accent" /><div><h1 className="text-xl font-black text-foreground">{name}</h1><p className="text-xs text-muted">Histórico da temporada no Cartola</p></div></div></header>
      <section className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface p-3 text-center"><Stat label="Pontos" value={data.account.totalPoints.toFixed(1)} /><Stat label="Rodadas" value={String(data.account.roundsPlayed)} /><Stat label="Patrimônio" value={`C$ ${data.account.currentBudget.toFixed(2)}`} /></section>
      <section className="space-y-2"><h2 className="px-1 text-xs font-black uppercase tracking-wider text-muted">Rodadas contabilizadas</h2>{data.lineups.length ? data.lineups.map((lineup: any) => <Link key={lineup.id} href={`/cartola/ranking/${userId}/${lineup.fantasyRound.round_id}`} className="glass-card flex items-center justify-between p-4 transition-colors hover:bg-surface-hover"><div><p className="text-[10px] font-black uppercase text-muted">Rodada {String(lineup.round?.number || 0).padStart(2, "0")}</p><p className="mt-1 text-xs text-muted">{lineup.round?.date} · jogadores {Number(lineup.player_points || 0).toFixed(1)} · palpites {Number(lineup.prediction_points || 0).toFixed(1)}</p></div><strong className="text-xl font-black text-accent">{Number(lineup.total_points || 0).toFixed(1)}</strong></Link>) : <p className="glass-card p-6 text-center text-sm text-muted">Nenhuma rodada processada ainda.</p>}</section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="min-w-0 px-2"><p className="text-[8px] font-black uppercase tracking-wider text-muted">{label}</p><p className="mt-1 truncate text-xs font-black text-foreground">{value}</p></div>; }
