"use client";

import { Crown, Medal, Sparkles, Target, TrendingDown, TrendingUp } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type { FantasyMarketPlayer, FantasyRadarData, FantasyRadarHighlight } from "@/lib/actions/fantasy";

type Props = {
  radar: FantasyRadarData;
  onSelectPlayer?: (player: FantasyMarketPlayer) => void;
};

export function FantasyRadarCarousel({ radar, onSelectPlayer }: Props) {
  const highlights: Array<{
    id: string;
    title: string;
    icon: typeof Sparkles;
    highlight: FantasyRadarHighlight | null;
    colorScheme: {
      border: string;
      bg: string;
      text: string;
      badgeBg: string;
    };
  }> = [
    {
      id: "mostSelected",
      title: "👑 Mais Escalado",
      icon: Crown,
      highlight: radar.mostSelected,
      colorScheme: {
        border: "border-accent/40",
        bg: "bg-accent/10",
        text: "text-accent",
        badgeBg: "bg-accent/20 text-accent",
      },
    },
    {
      id: "mostCaptained",
      title: "© Mais Capitão",
      icon: Medal,
      highlight: radar.mostCaptained,
      colorScheme: {
        border: "border-warning/40",
        bg: "bg-warning/10",
        text: "text-warning",
        badgeBg: "bg-warning/20 text-warning",
      },
    },
    {
      id: "topValuation",
      title: "📈 Maior Valorização",
      icon: TrendingUp,
      highlight: radar.topValuation,
      colorScheme: {
        border: "border-success/40",
        bg: "bg-success/10",
        text: "text-success",
        badgeBg: "bg-success/20 text-success",
      },
    },
    {
      id: "topDepreciation",
      title: "📉 Maior Queda",
      icon: TrendingDown,
      highlight: radar.topDepreciation,
      colorScheme: {
        border: "border-danger/40",
        bg: "bg-danger/10",
        text: "text-danger",
        badgeBg: "bg-danger/20 text-danger",
      },
    },
    {
      id: "bestCostBenefit",
      title: "💎 Melhor Custo-Benefício",
      icon: Sparkles,
      highlight: radar.bestCostBenefit,
      colorScheme: {
        border: "border-accent/40",
        bg: "bg-accent/10",
        text: "text-accent",
        badgeBg: "bg-accent/20 text-accent",
      },
    },
    {
      id: "bestForm",
      title: "🔥 Melhor Forma",
      icon: Sparkles,
      highlight: radar.bestForm,
      colorScheme: {
        border: "border-warning/40",
        bg: "bg-warning/10",
        text: "text-warning",
        badgeBg: "bg-warning/20 text-warning",
      },
    },
    {
      id: "mostBought",
      title: "🛒 Mais Comprado",
      icon: TrendingUp,
      highlight: radar.mostBought,
      colorScheme: {
        border: "border-emerald-400/40",
        bg: "bg-emerald-400/10",
        text: "text-emerald-400",
        badgeBg: "bg-emerald-400/20 text-emerald-400",
      },
    },
    {
      id: "mostSold",
      title: "💸 Mais Vendido",
      icon: TrendingDown,
      highlight: radar.mostSold,
      colorScheme: {
        border: "border-orange-400/40",
        bg: "bg-orange-400/10",
        text: "text-orange-400",
        badgeBg: "bg-orange-400/20 text-orange-400",
      },
    },
    {
      id: "favoriteScorer",
      title: "⚽ Favorito a Gol",
      icon: Target,
      highlight: radar.favoriteScorer,
      colorScheme: {
        border: "border-warning/40",
        bg: "bg-warning/10",
        text: "text-warning",
        badgeBg: "bg-warning/20 text-warning",
      },
    },
    {
      id: "favoriteAssist",
      title: "🍽️ Favorito a Garçom",
      icon: Target,
      highlight: radar.favoriteAssist,
      colorScheme: {
        border: "border-accent/40",
        bg: "bg-accent/10",
        text: "text-accent",
        badgeBg: "bg-accent/20 text-accent",
      },
    },
  ];

  const activeHighlights = highlights.filter((h) => h.highlight && h.highlight.player);

  if (activeHighlights.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-accent/20 text-accent text-xs">
            📡
          </span>
          <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
            Radar Cartola
          </h2>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-accent">
            Mercado Vivo
          </span>
        </div>
        <p className="text-[10px] text-muted">Arraste para o lado →</p>
      </div>

      {/* Carrossel Horizontal com Snap e Scroll Suave */}
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 pt-0.5 snap-x snap-mandatory">
        {activeHighlights.map((item) => {
          const { highlight, title, colorScheme } = item;
          if (!highlight) return null;
          const { player, value, extra } = highlight;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectPlayer?.(player)}
              className={`group flex min-w-[200px] max-w-[230px] shrink-0 snap-start flex-col justify-between rounded-2xl border ${colorScheme.border} ${colorScheme.bg} p-3 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[9px] font-black uppercase tracking-wider text-foreground">
                  {title}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black ${colorScheme.badgeBg}`}
                >
                  {value}
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-2.5">
                <PlayerAvatar
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  clickable={false}
                  className="h-10 w-10 shrink-0 rounded-full border border-border bg-background text-xs font-black text-accent shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-foreground group-hover:text-accent transition-colors">
                    {player.name}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] font-bold text-muted">
                    {extra || `C$ ${player.price.toFixed(2)}`}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-1.5 text-[8px] text-muted">
                <span>C$ {player.price.toFixed(2)}</span>
                <span className="font-bold text-accent">Ver detalhes →</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
