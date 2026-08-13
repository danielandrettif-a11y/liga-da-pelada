import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { PlayerAvatar } from "@/components/PlayerAvatar";

export default async function FantasyRoundHistoryPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params; const account = await getCurrentAccount(); if (!account.user) redirect("/login");
  const { data: fantasyRound } = await account.client.from("fantasy_rounds").select("id, market_status, round:round_id(number, date)").eq("round_id", roundId).maybeSingle();
  if (!fantasyRound) notFound();
  const { data: lineup } = await account.client.from("fantasy_lineups").select("*, fantasy_lineup_players(*, players(name, avatar_url))").eq("fantasy_round_id", fantasyRound.id).eq("user_id", account.user.id).maybeSingle();
  if (!lineup) notFound();
  return <div className="space-y-5"><header><Link href="/cartola/historico" className="text-xs font-bold text-accent">← Histórico</Link><h1 className="mt-3 text-xl font-black text-foreground">Rodada {(fantasyRound.round as any)?.number}</h1><p className="text-xs text-muted">Escalação e valorização registradas.</p></header><div className="grid grid-cols-3 gap-2"><Metric label="Jogadores" value={String(lineup.fantasy_lineup_players?.length || 0)}/><Metric label="Palpites" value={Number(lineup.prediction_points || 0).toFixed(1)}/><Metric label="Total" value={Number(lineup.total_points || 0).toFixed(1)}/></div><div className="space-y-2">{(lineup.fantasy_lineup_players || []).map((item: any) => <div key={item.id} className="glass-card flex items-center gap-3 p-3"><PlayerAvatar name={item.players?.name || "Jogador"} avatarUrl={item.players?.avatar_url} className="h-10 w-10 rounded-full bg-surface text-xs font-black text-accent"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-foreground">{item.players?.name}</p><p className="text-[10px] text-muted">C$ {Number(item.price_locked).toFixed(2)} → C$ {Number(item.price_after || item.price_locked).toFixed(2)}</p></div><strong className="text-base text-accent">{Number(item.total_points).toFixed(1)}</strong></div>)}</div></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="glass-card p-3 text-center"><p className="text-lg font-black text-accent">{value}</p><p className="text-[8px] font-black uppercase text-muted">{label}</p></div>; }
