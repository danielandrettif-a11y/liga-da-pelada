import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getFantasyUserRoundHistory } from "@/lib/actions/fantasy";
import { buildBQBasePointBreakdown, normalizeBQScoringSnapshot } from "@/lib/bq-scoring";
import { calculatePositionBreakdown } from "@/lib/fantasy/position-breakdown";
import type { FantasySlotRole } from "@/lib/fantasy/lineup-positions";

const value = (source: Record<string, unknown>, key: string, fallback = 0) => Number(source[key] ?? fallback);

export default async function FantasyLineupPlayerDetailPage({ params }: { params: Promise<{ userId: string; roundId: string; playerId: string }> }) {
  const { userId, roundId, playerId } = await params;
  const data = await getFantasyUserRoundHistory(userId, roundId);
  const item = data?.lineup.fantasy_lineup_players?.find((entry: any) => entry.player_id === playerId);
  if (!data || !item) notFound();
  const playerName = item.player_name_locked || item.players?.name || "Jogador";
  const stat = (data.statsByPlayer[playerId] || {}) as Record<string, unknown>;
  const settings = data.settingsSnapshot as Record<string, unknown>;
  const suppressGoalkeeperRewards = Boolean(data.round?.suppress_goalkeeper_rewards);
  const snapshot = normalizeBQScoringSnapshot(settings);
  const entries = buildBQBasePointBreakdown(snapshot, {
    goals: value(stat, "goals"),
    assists: value(stat, "assists"),
    wins: value(stat, "wins"),
    draws: value(stat, "draws"),
    losses: value(stat, "losses"),
    ownGoals: value(stat, "own_goals"),
    goalkeeperAppearances: value(stat, "goalkeeper_games"),
    goalkeeperGoalsConceded: value(stat, "goals_conceded"),
  }, { suppressGoalkeeperRewards });
  const slotRole = (["GOL", "DEF", "MEI", "ATA"].includes(item.slot_role) ? item.slot_role : "ATA") as FantasySlotRole;
  const position = calculatePositionBreakdown({
    slotRole,
    playerProfile: item.player_profile_locked,
    goals: value(stat, "goals"),
    assists: value(stat, "assists"),
    defensiveCleanGames: value(stat, "defensive_clean_games"),
    defensiveOneGoalGames: value(stat, "defensive_one_goal_games"),
    goalkeeperGames: value(stat, "goalkeeper_games"),
    cleanSheets: value(stat, "clean_sheets"),
    suppressGoalkeeperRewards,
  });
  const captain = item.player_id === data.lineup.captain_player_id;
  return <div className="space-y-5"><header><Link href={`/cartola/ranking/${userId}/${roundId}`} className="text-xs font-bold text-accent">← Voltar à escalação</Link><div className="mt-4 flex items-center gap-3"><PlayerAvatar name={playerName} avatarUrl={item.avatar_url_locked || item.players?.avatar_url} className="h-14 w-14 rounded-full bg-surface text-base font-black text-accent" /><div><h1 className="text-xl font-black text-foreground">{playerName}</h1><p className="text-xs text-muted">Rodada {String(data.round?.number || 0).padStart(2, "0")} · composição dos pontos</p></div></div></header><section className="glass-card space-y-3 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-muted">O que aconteceu em campo</p>{entries.length ? entries.map((entry) => <Row key={entry.key} label={`${entry.label} · ${entry.count}${entry.unitPoints === 0 ? " (sem prêmio nesta rodada)" : ""}`} points={entry.points} />) : <p className="text-sm text-muted">Nenhuma ação pontuável registrada nesta rodada.</p>}<div className="border-t border-border pt-3"><Row label="Scouts básicos" points={Number(item.base_points || 0) - Number(item.position_bonus || 0)} strong /></div>{position.events.map((event) => <Row key={event.label} label={`${event.label} · ${event.count}`} points={event.value} />)}{position.specialBonus?.activated && <Row label={`Bônus ${position.specialBonus.name}`} points={position.specialBonus.value} />}{Number(item.position_bonus || 0) !== 0 && <Row label={`Bônus ${slotRole} aplicado${position.capReached ? ` (teto ${position.cap})` : ""}`} points={Number(item.position_bonus || 0)} strong />}{captain && <Row label="Bônus de capitão" points={Number(item.captain_bonus || 0)} /> }<div className="border-t border-border pt-3"><Row label="Total deste jogador" points={Number(item.total_points || 0)} strong /></div></section><p className="px-1 text-[11px] leading-5 text-muted">Cartas são bônus da escalação inteira, por isso aparecem no total da rodada — não são atribuídas a um jogador específico.</p></div>;
}

function Row({ label, points, strong = false }: { label: string; points: number; strong?: boolean }) { return <div className="flex items-center justify-between gap-3"><span className={strong ? "text-sm font-black text-foreground" : "text-xs font-bold text-foreground"}>{label}</span><strong className={points > 0 ? "text-accent" : points < 0 ? "text-danger" : "text-muted"}>{points > 0 ? "+" : ""}{points.toFixed(1)} pts</strong></div>; }
