import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { CHALLENGE_LABELS, isFantasyChallengeType } from "@/lib/fantasy/challenges";

export default async function FantasyRoundHistoryPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const account = await getCurrentAccount();
  if (!account.user) redirect("/login");
  const { data: fantasyRound } = await account.client.from("fantasy_rounds").select("id, market_status, challenge_type, rules_version, round:round_id(number, date)").eq("round_id", roundId).maybeSingle();
  if (!fantasyRound) notFound();
  const { data: lineup } = await account.client.from("fantasy_lineups").select("*, fantasy_lineup_players(*, players(name, avatar_url))").eq("fantasy_round_id", fantasyRound.id).eq("user_id", account.user.id).maybeSingle();
  if (!lineup) notFound();

  const breakdown = (lineup.score_breakdown || {}) as Record<string, number>;
  const predictions = (lineup.predictions_snapshot || {}) as Record<string, any>;
  const challenge = (lineup.challenge_snapshot || {}) as Record<string, any>;
  const challengeType = isFantasyChallengeType(challenge.type) ? challenge.type : null;

  return <div className="space-y-5">
    <header><Link href="/cartola/historico" className="text-xs font-bold text-accent">← Histórico</Link><h1 className="mt-3 text-xl font-black text-foreground">Rodada {(fantasyRound.round as any)?.number}</h1><p className="text-xs text-muted">Escalação, palpites e pontuação congelados.</p></header>
    <div className="grid grid-cols-3 gap-2"><Metric label="Posição" value={lineup.round_position ? `${lineup.round_position}º` : "—"}/><Metric label="Palpites" value={Number(lineup.prediction_points || 0).toFixed(1)}/><Metric label="Total" value={Number(lineup.total_points || 0).toFixed(1)}/></div>
    <section className="space-y-2"><h2 className="text-xs font-black uppercase text-muted">Escalação</h2>{(lineup.fantasy_lineup_players || []).map((item: any) => { const name = item.player_name_locked || item.players?.name || "Jogador"; const captain = item.player_id === lineup.captain_player_id; const positionBonus = Number(item.position_bonus || 0); const fieldBase = Number(item.base_points || 0) - positionBonus; const captainBonus = Number(item.captain_bonus || 0); return <div key={item.id} className="glass-card flex items-center gap-3 p-3"><PlayerAvatar name={name} avatarUrl={item.avatar_url_locked || item.players?.avatar_url} className="h-10 w-10 rounded-full bg-surface text-xs font-black text-accent"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-foreground">{name}{captain ? " · Capitão" : ""}</p><p className="text-[10px] text-muted">Base {fieldBase.toFixed(1)} · posição {positionBonus.toFixed(1)}{captain ? ` · capitão ${captainBonus.toFixed(1)}` : ""}</p></div><strong className="text-base text-accent">{Number(item.total_points || 0).toFixed(1)}</strong></div>; })}</section>
    <section className="glass-card space-y-3 p-4"><h2 className="text-xs font-black uppercase text-muted">Composição da pontuação</h2><ScoreRow label="Pontos-base dos jogadores" value={Number(breakdown.playersBase || 0)}/><ScoreRow label="Bônus por posição correta" value={Number(breakdown.positionBonus || 0)}/><ScoreRow label="Bônus do capitão" value={Number(breakdown.captainBonus || 0)}/><ScoreRow label={`Artilheiro${predictions.topScorer?.playerName ? ` · ${predictions.topScorer.playerName}` : ""}`} value={Number(breakdown.topScorer || 0)}/><ScoreRow label={`Garçom${predictions.topAssist?.playerName ? ` · ${predictions.topAssist.playerName}` : ""}`} value={Number(breakdown.topAssist || 0)}/><ScoreRow label={`${challengeType ? CHALLENGE_LABELS[challengeType] : "Desafio"}${challenge.playerName ? ` · ${challenge.playerName}` : ""}`} value={Number(breakdown.challenge || 0)}/>{breakdown.cardBonus != null && <ScoreRow label={String(breakdown.cardDescription || "Carta utilizada")} value={Number(breakdown.cardBonus || 0)}/>}</section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="glass-card p-3 text-center"><p className="text-lg font-black text-accent">{value}</p><p className="text-[8px] font-black uppercase text-muted">{label}</p></div>; }
function ScoreRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"><span className="min-w-0 truncate text-xs font-bold text-foreground">{label}</span><strong className={value > 0 ? "text-accent" : "text-muted"}>{value.toFixed(1)} pts</strong></div>; }
