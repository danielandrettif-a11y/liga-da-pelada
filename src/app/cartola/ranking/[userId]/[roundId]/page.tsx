import Link from "next/link";
import { notFound } from "next/navigation";
import { FantasyLineupMiniPitch } from "@/components/fantasy/FantasyLineupMiniPitch";
import { getFantasyUserRoundHistory } from "@/lib/actions/fantasy";
import { resolveFantasyCardBenefit } from "@/lib/fantasy/card-benefits";

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
  const cardBenefit = activeCard ? resolveFantasyCardBenefit({
    slug: activeCard.slug,
    status: activeCard.status,
    bonus: activeCard.bonus,
    details: activeCard.details,
    fallbackBonus: Number(breakdown.cardBonus || 0),
    fallbackDescription: activeCard.description,
  }) : null;

  return <div className="space-y-5">
    <header><Link href="/cartola/ranking?scope=round" className="text-xs font-bold text-accent">← Ranking da rodada</Link><h1 className="mt-3 text-xl font-black text-foreground">Rodada {String(data.round?.number || 0).padStart(2, "0")}</h1><p className="mt-1 text-xs text-muted">{data.round?.date} · {data.isLive ? "prévia ao vivo" : "total"} {Number(data.lineup.total_points || 0).toFixed(1)} pts</p>{data.isLive && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[9px] font-black uppercase text-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Atualizando durante os jogos</span>}</header>
    <section className="space-y-2"><div className="flex items-end justify-between px-1"><h2 className="text-xs font-black uppercase text-muted">Escalação</h2><p className="text-[10px] font-bold text-muted">Toque no atleta para detalhar</p></div><FantasyLineupMiniPitch players={players} captainId={data.lineup.captain_player_id} playerHref={(playerId) => `/cartola/ranking/${userId}/${roundId}/${playerId}`} /></section>
    {activeCard && <section className="rounded-2xl border border-[#d7adff]/40 bg-[#a04dff]/10 p-4">
      <p className="text-[9px] font-black uppercase tracking-wider text-[#d7adff]">🃏 Carta usada</p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-black text-foreground">{activeCard.name}</h2><p className="mt-1 text-[11px] leading-4 text-muted">{activeCard.details?.description || activeCard.description}</p>{activeCard.slug === "super_captain" && <p className="mt-2 text-[10px] leading-4 text-[#e2bcff]">O capitão passou de 2x para 3x nesta rodada. O ganho adicional é limitado a 8 pontos.</p>}</div>
        <strong className={`shrink-0 text-right text-sm font-black ${cardBenefit?.applied ? "text-accent" : "text-[#e2bcff]"}`}>{cardBenefit?.label}</strong>
      </div>
    </section>}
    {!activeCard && <section className="rounded-2xl border border-white/10 bg-surface/50 p-4 text-xs font-bold text-muted">🃏 Nenhuma carta usada nesta rodada.</section>}
  </div>;
}
