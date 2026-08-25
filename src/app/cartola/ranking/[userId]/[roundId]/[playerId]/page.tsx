import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getFantasyUserRoundHistory } from "@/lib/actions/fantasy";

const value = (source: Record<string, unknown>, key: string, fallback = 0) => Number(source[key] ?? fallback);

export default async function FantasyLineupPlayerDetailPage({ params }: { params: Promise<{ userId: string; roundId: string; playerId: string }> }) {
  const { userId, roundId, playerId } = await params;
  const data = await getFantasyUserRoundHistory(userId, roundId);
  const item = data?.lineup.fantasy_lineup_players?.find((entry: any) => entry.player_id === playerId);
  if (!data || !item) notFound();
  const playerName = item.player_name_locked || item.players?.name || "Jogador";
  const stat = (data.statsByPlayer[playerId] || {}) as Record<string, unknown>;
  const settings = data.settingsSnapshot as Record<string, unknown>;
  const entries = [
    { label: "Gols", amount: value(stat, "goals"), points: value(stat, "goals") * value(settings, "goal_points") },
    { label: "Assistências", amount: value(stat, "assists"), points: value(stat, "assists") * value(settings, "assist_points") },
    { label: "Vitórias", amount: value(stat, "wins"), points: value(stat, "wins") * value(settings, "win_points") },
    { label: "Derrotas", amount: value(stat, "losses"), points: value(stat, "losses") * value(settings, "loss_points") },
    { label: "Jogos como goleiro", amount: value(stat, "goalkeeper_games"), points: value(stat, "goalkeeper_games") * value(settings, "goalkeeper_appearance_points") },
    { label: "Gols sofridos como goleiro", amount: value(stat, "goals_conceded"), points: value(stat, "goals_conceded") * value(settings, "goal_conceded_points") },
    { label: "Proteção DEF (scout base)", amount: value(stat, "defensive_clean_games") + value(stat, "defensive_one_goal_games"), points: value(stat, "defensive_clean_games") * 2 + value(stat, "defensive_one_goal_games") },
  ].filter((entry) => entry.amount !== 0);
  const captain = item.player_id === data.lineup.captain_player_id;
  return <div className="space-y-5"><header><Link href={`/cartola/ranking/${userId}/${roundId}`} className="text-xs font-bold text-accent">← Voltar à escalação</Link><div className="mt-4 flex items-center gap-3"><PlayerAvatar name={playerName} avatarUrl={item.avatar_url_locked || item.players?.avatar_url} className="h-14 w-14 rounded-full bg-surface text-base font-black text-accent" /><div><h1 className="text-xl font-black text-foreground">{playerName}</h1><p className="text-xs text-muted">Rodada {String(data.round?.number || 0).padStart(2, "0")} · composição dos pontos</p></div></div></header><section className="glass-card space-y-3 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-muted">O que aconteceu em campo</p>{entries.length ? entries.map((entry) => <Row key={entry.label} label={`${entry.label} · ${entry.amount}`} points={entry.points} />) : <p className="text-sm text-muted">Nenhuma ação pontuável registrada nesta rodada.</p>}<div className="border-t border-border pt-3"><Row label="Pontos-base" points={Number(item.base_points || 0) - Number(item.position_bonus || 0)} strong /></div>{Number(item.position_bonus || 0) !== 0 && <Row label="Bônus da vaga escalada" points={Number(item.position_bonus || 0)} />}{captain && <Row label="Bônus de capitão" points={Number(item.captain_bonus || 0)} /> }<div className="border-t border-border pt-3"><Row label="Total deste jogador" points={Number(item.total_points || 0)} strong /></div></section><p className="px-1 text-[11px] leading-5 text-muted">Palpites e cartas são bônus da escalação inteira, por isso aparecem no total da rodada — não são atribuídos a um jogador específico.</p></div>;
}

function Row({ label, points, strong = false }: { label: string; points: number; strong?: boolean }) { return <div className="flex items-center justify-between gap-3"><span className={strong ? "text-sm font-black text-foreground" : "text-xs font-bold text-foreground"}>{label}</span><strong className={points > 0 ? "text-accent" : points < 0 ? "text-danger" : "text-muted"}>{points > 0 ? "+" : ""}{points.toFixed(1)} pts</strong></div>; }
