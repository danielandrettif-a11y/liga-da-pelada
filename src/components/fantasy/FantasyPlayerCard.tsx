"use client";

import Link from "next/link";
import { Sparkles, TrendingDown, TrendingUp } from "@/components/icons";

export function FantasyPlayerCard({ summary }: { summary: any }) {
  if (!summary) return null;

  const history = summary.history || [];
  const prices = history.length > 0 ? history.map((item: any) => Number(item.price_after ?? item.priceAfter ?? summary.price)) : [summary.price];
  const plotPrices = prices.length === 1 ? [10, prices[0]] : prices;
  const min = Math.min(...plotPrices);
  const max = Math.max(...plotPrices);
  const span = Math.max(0.5, max - min);

  const points = plotPrices
    .map((price: number, index: number) => {
      const x = plotPrices.length <= 1 ? 50 : index * (100 / (plotPrices.length - 1));
      const y = 38 - ((price - min) / span) * 30;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const variation = summary.variation != null ? summary.variation : summary.history?.at(-1)?.variation_rate || 0;
  const trendLabel = summary.trendLabel || (variation > 0 ? "Em Alta" : variation < 0 ? "Em Baixa" : "Estável");
  const trendIcon = summary.trendIcon || (variation > 0 ? "🔥" : variation < 0 ? "📉" : "➡️");
  const formLabel = summary.formLabel || (summary.averagePoints >= 12 ? "Excelente" : "Regular");
  const costBenefitScore = summary.costBenefitScore != null ? summary.costBenefitScore : 7.5;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-black uppercase tracking-wider text-muted">No Cartola V2</h3>
        </div>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-accent">
          Mercado Vivo
        </span>
      </div>

      <div className="glass-card overflow-hidden p-4 space-y-3">
        {/* Métricas Principais */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[8px] font-black uppercase text-muted">Preço Atual</p>
            <p className="mt-0.5 text-base font-black text-accent">C$ {summary.price.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-muted">Variação</p>
            <p className={`mt-0.5 text-base font-black flex items-center gap-1 ${variation >= 0 ? "text-success" : "text-danger"}`}>
              {variation >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {variation > 0 ? "+" : ""}{(variation * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-muted">Média</p>
            <p className="mt-0.5 text-base font-black text-foreground">
              {summary.roundsPlayed ? (summary.totalPoints / summary.roundsPlayed).toFixed(1) : "0.0"} <span className="text-[9px] font-normal text-muted">pts</span>
            </p>
          </div>
        </div>

        {/* Badges de Tendência, Forma e Custo-Benefício */}
        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-2 text-center text-[9px]">
          <div className="rounded-lg bg-surface/50 p-1.5">
            <span className="text-[7px] font-black uppercase text-muted block">Tendência</span>
            <span className="font-black text-foreground mt-0.5 block">{trendIcon} {trendLabel}</span>
          </div>
          <div className="rounded-lg bg-surface/50 p-1.5">
            <span className="text-[7px] font-black uppercase text-muted block">Forma</span>
            <span className="font-black text-foreground mt-0.5 block">{formLabel}</span>
          </div>
          <div className="rounded-lg bg-surface/50 p-1.5">
            <span className="text-[7px] font-black uppercase text-muted block">Custo-Benefício</span>
            <span className="font-black text-accent mt-0.5 block flex items-center justify-center gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> {costBenefitScore.toFixed(1)}/10
            </span>
          </div>
        </div>

        {/* Gráfico de Evolução de Preço */}
        {plotPrices.length > 1 && (
          <div className="border-t border-white/5 pt-2">
            <p className="text-[8px] font-bold text-muted">Histórico de Preço</p>
            <svg viewBox="0 0 100 42" className="mt-1 h-14 w-full overflow-visible" preserveAspectRatio="none" aria-label="Evolução do preço">
              <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        )}

        <Link
          href="/cartola"
          className="block w-full rounded-xl bg-accent/15 py-2.5 text-center text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/25 transition-colors"
        >
          Abrir Mercado do Cartola →
        </Link>
      </div>
    </section>
  );
}
