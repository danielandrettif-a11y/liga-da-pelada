import Image from "next/image";
import Link from "next/link";
import { Football, Medal, Target, TrendingUp, Trophy, type SportIconProps } from "@/components/icons";
import type { ComponentType } from "react";
import { getRankingExperienceData } from "@/lib/actions/stats";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { CombatBeltBadges } from "@/components/CombatBeltBadges";
import { cosmeticBackgroundPosition, cosmeticHighResolutionImage } from "@/lib/fantasy/cosmetics";
import { formatRankingPoints } from "@/lib/ranking";

function StatHighlightCard({ Icon, label, playerName, value, unit, delay }: {
  Icon: ComponentType<SportIconProps>;
  label: string;
  playerName?: string;
  value?: number;
  unit: string;
  delay: string;
}) {
  return <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d2417] to-[#06100b] p-4 shadow-[0_14px_32px_rgba(0,0,0,.2)] animate-fade-in-up ${delay}`}>
    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-accent/40 to-transparent" />
    <div className="mb-3 flex items-center gap-2"><Icon className="h-5 w-5 text-accent" /><span className="font-athletic text-xs font-bold uppercase italic tracking-wider text-muted">{label}</span></div>
    <p className="truncate text-base font-bold text-foreground">{playerName || "-"}</p>
    <div className="mt-1 flex items-baseline gap-1"><span className="stat-number text-3xl text-accent">{value || 0}</span><span className="text-xs font-medium text-muted">{unit}</span></div>
  </div>;
}

export function HomeRankingPreviewFallback() {
  return <div className="space-y-4" aria-label="Carregando destaques e ranking">
    <div className="h-28 animate-pulse rounded-2xl bg-surface" />
    <div className="h-72 animate-pulse rounded-2xl bg-surface" />
  </div>;
}

/** A home não espera OVR, cinturões e cosméticos para mostrar a agenda. */
export async function HomeRankingPreview() {
  const ranking = await getRankingExperienceData();
  const entries = ranking.general;
  const highlights = {
    topScorer: [...entries].sort((a, b) => b.goals - a.goals)[0],
    topAssists: [...entries].sort((a, b) => b.assists - a.assists)[0],
    topWins: [...entries].sort((a, b) => b.wins - a.wins)[0],
  };
  const cards = [
    { Icon: Football, label: "Líder de gols", player: highlights.topScorer, value: highlights.topScorer?.goals, unit: "gols" },
    { Icon: Target, label: "Líder de assistências", player: highlights.topAssists, value: highlights.topAssists?.assists, unit: "assists" },
    { Icon: Trophy, label: "Vitórias", player: highlights.topWins, value: highlights.topWins?.wins, unit: "vitórias" },
  ];

  return <>
    <section>
      <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-accent" /><h2 className="font-athletic text-base font-black uppercase italic tracking-wider text-foreground">Destaques da Temporada</h2></div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 hide-scrollbar">
        {cards.map(({ Icon, label, player, value, unit }, index) => <div key={label} className="min-w-[150px] shrink-0 snap-center"><StatHighlightCard Icon={Icon} label={label} playerName={value && value > 0 ? player?.player.name : undefined} value={value && value > 0 ? value : 0} unit={unit} delay={`stagger-${index + 1}`} /></div>)}
      </div>
    </section>
    <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-athletic text-base font-black uppercase italic tracking-wider text-foreground"><Medal className="h-5 w-5 text-accent" /> Top 5 Ranking</h2><Link href="/ranking" className="text-xs font-semibold text-accent hover:text-accent-light">Ver completo →</Link></div>
      <div className="glass-card overflow-hidden">
        {entries.length ? entries.slice(0, 5).map((stats, index) => {
          const name = stats.player?.name || "Desconhecido";
          const bannerAssetKey = stats.cosmetics?.bannerAssetKey || null;
          const bannerImage = cosmeticHighResolutionImage(bannerAssetKey);
          return <Link href={`/jogadores/${stats.player.id}`} key={stats.player.id} className={`group relative isolate flex min-h-[88px] items-center gap-3 overflow-hidden px-4 py-3.5 transition-colors hover:bg-surface-hover ${index < Math.min(entries.length, 5) - 1 ? "border-b border-border" : ""}`}>
            {bannerImage && <><Image src={bannerImage} alt="" fill quality={80} sizes="(max-width: 640px) 100vw, 720px" className="pointer-events-none -z-20 object-cover opacity-70 transition-transform duration-500 group-hover:scale-[1.035]" style={{ objectPosition: cosmeticBackgroundPosition("banner", bannerAssetKey) }} /><span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(4,18,10,.98)_0%,rgba(4,18,10,.94)_30%,rgba(4,18,10,.62)_64%,rgba(4,18,10,.78)_100%)]" /></>}
            <span className={`rank-badge ${index < 3 ? `rank-${index + 1}` : "bg-surface text-muted"}`}>{index + 1}</span>
            <PlayerAvatar name={name} playerId={stats.player.id} avatarUrl={stats.player.avatar_url} frameKey={stats.cosmetics?.frameKey} auraKey={stats.cosmetics?.auraKey} className="h-9 w-9 flex-shrink-0 rounded-full border border-border bg-surface-hover text-xs font-bold text-muted" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{name}</p><CombatBeltBadges belts={stats.achievementBelts} compact /><div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted"><span className="flex items-center gap-1"><Football className="h-3 w-3" /> {stats.goals}</span><span className="flex items-center gap-1"><Target className="h-3 w-3" /> {stats.assists}</span></div></div>
            <div className="text-right"><p className="stat-number gradient-text text-lg">{formatRankingPoints(stats.points)}</p><p className="text-[10px] font-medium text-muted">pts</p></div>
          </Link>;
        }) : <div className="p-6 text-center text-sm text-muted">Nenhuma pontuação registrada ainda.</div>}
      </div>
    </section>
  </>;
}
