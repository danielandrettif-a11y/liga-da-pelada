import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getFantasyUserRoundHistory } from "@/lib/actions/fantasy";

export default async function FantasyUserRoundHistoryPage({ params }: { params: Promise<{ userId: string; roundId: string }> }) {
  const { userId, roundId } = await params;
  const data = await getFantasyUserRoundHistory(userId, roundId);
  if (!data) notFound();
  const name = (data.history.player as any)?.name || "Cartoleiro";
  // A ordem dos slots é a escalação oficial. A relação aninhada do Supabase
  // não garante ordenação, o que podia colocar o goleiro fora do campo — ou
  // fazê-lo cair na sexta posição que a grade antiga não renderizava.
  const players = [...(data.lineup.fantasy_lineup_players || [])].sort(
    (first: any, second: any) =>
      Number(first.slot_index ?? Number.MAX_SAFE_INTEGER) -
      Number(second.slot_index ?? Number.MAX_SAFE_INTEGER),
  );
  const breakdown = (data.lineup.score_breakdown || {}) as Record<string, unknown>;
  const savedCardSlug = typeof breakdown.cardSlug === "string" ? breakdown.cardSlug : null;
  const savedCardName = savedCardSlug === "super_captain"
    ? "Super Capitão"
    : savedCardSlug
      ? savedCardSlug.replaceAll("_", " ")
      : "Carta utilizada";
  const activeCard = data.activeCard || (savedCardSlug || breakdown.cardBonus != null
    ? {
        name: savedCardName,
        slug: savedCardSlug,
        details: null,
        description: typeof breakdown.cardDescription === "string" ? breakdown.cardDescription : null,
        bonus: Number(breakdown.cardBonus || 0),
      }
    : null);

  return <div className="space-y-5">
    <header><Link href="/cartola/ranking?scope=round" className="text-xs font-bold text-accent">← Ranking da rodada</Link><h1 className="mt-3 text-xl font-black text-foreground">Rodada {String(data.round?.number || 0).padStart(2, "0")}</h1><p className="mt-1 text-xs text-muted">{data.round?.date} · {data.isLive ? "prévia ao vivo" : "total"} {Number(data.lineup.total_points || 0).toFixed(1)} pts</p>{data.isLive && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[9px] font-black uppercase text-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Atualizando durante os jogos</span>}</header>
    <section className="space-y-2"><div className="flex items-end justify-between px-1"><h2 className="text-xs font-black uppercase text-muted">Escalação</h2><p className="text-[10px] font-bold text-muted">Toque no atleta para detalhar</p></div><MiniPitch players={players} userId={userId} roundId={roundId} captainId={data.lineup.captain_player_id} /></section>
    {activeCard && <section className="rounded-2xl border border-[#d7adff]/40 bg-[#a04dff]/10 p-4">
      <p className="text-[9px] font-black uppercase tracking-wider text-[#d7adff]">🃏 Carta usada</p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-black text-foreground">{activeCard.name}</h2><p className="mt-1 text-[11px] leading-4 text-muted">{activeCard.details?.description || activeCard.description}</p>{activeCard.slug === "super_captain" && <p className="mt-2 text-[10px] leading-4 text-[#e2bcff]">O capitão passou de 2x para 3x nesta rodada. O ganho adicional é limitado a 8 pontos.</p>}</div>
        <strong className="shrink-0 text-lg font-black text-[#e2bcff]">{activeCard.bonus > 0 ? "+" : ""}{activeCard.bonus.toFixed(1)} pts</strong>
      </div>
    </section>}
  </div>;
}

function MiniPitch({ players, userId, roundId, captainId }: { players: any[]; userId: string; roundId: string; captainId: string | null }) {
  const playersByRole = (role: "ATA" | "MEI" | "DEF" | "GOL") =>
    players.filter((player) => player.slot_role === role);
  const hasSavedRoles = players.some((player) => player.slot_role);
  // Com as vagas persistidas, a grade acompanha qualquer formação válida:
  // 5 atletas (sem GOL) ou 6 atletas, quando o goleiro ocupa a última vaga.
  // Mantemos um fallback para escalações antigas que ainda não tinham papel.
  const rows = hasSavedRoles
    ? [playersByRole("ATA"), playersByRole("MEI"), playersByRole("DEF"), playersByRole("GOL")].filter((row) => row.length > 0)
    : players.length >= 6
    ? [players.slice(0, 2), players.slice(2, 3), players.slice(3, 5), players.slice(5, 6)]
    : [players.slice(0, 2), players.slice(2, 4), players.slice(4, 5)];
  return <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-emerald-300/30 bg-[radial-gradient(circle_at_50%_40%,rgba(53,170,97,.22),transparent_50%),linear-gradient(160deg,#092a1b,#04130c)] p-3 shadow-inner"><div className="absolute inset-x-0 top-1/2 border-t border-white/25" /><div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" /><div className="absolute inset-x-5 top-3 bottom-3 border border-white/20" /><div className="relative z-10 flex min-h-[396px] flex-col justify-between py-2">{rows.map((row, index) => <div key={index} className={`flex ${row.length === 2 ? "justify-around" : "justify-center"}`}>{row.map((player: any) => { const playerName = player.player_name_locked || player.players?.name || "Jogador"; const captain = player.player_id === captainId; return <Link key={player.id} href={`/cartola/ranking/${userId}/${roundId}/${player.player_id}`} className="flex w-28 flex-col items-center text-center transition-transform active:scale-95"><div className={`relative rounded-full ${captain ? "ring-2 ring-accent" : ""}`}><PlayerAvatar name={playerName} avatarUrl={player.avatar_url_locked || player.players?.avatar_url} className="h-12 w-12 rounded-full border-2 border-emerald-200 bg-background text-xs font-black text-accent" />{captain && <span className="absolute -right-2 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-black text-background">C</span>}</div><span className="mt-1 max-w-28 truncate rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-black text-white">{playerName}</span><span className="mt-0.5 text-[10px] font-black text-accent">{Number(player.total_points || 0).toFixed(1)} pts</span></Link>; })}</div>)}</div></div>;
}
