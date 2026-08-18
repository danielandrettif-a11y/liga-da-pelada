"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatFantasyMoney, type FantasySettings } from "@/lib/fantasy/config";
import type { FantasyMarketPlayer } from "@/lib/actions/fantasy";
import { getFantasyPlayerDetail } from "@/lib/actions/fantasy";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  player: FantasyMarketPlayer | null;
  settings: FantasySettings;
  isOpen: boolean;
  onClose: () => void;
  onToggleBuy?: (player: FantasyMarketPlayer) => void;
  isBought?: boolean;
  isMarketOpen?: boolean;
};

export function FantasyPlayerDrawer({
  player,
  settings,
  isOpen,
  onClose,
  onToggleBuy,
  isBought = false,
  isMarketOpen = true,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && player?.id) {
      setLoading(true);
      getFantasyPlayerDetail(player.id)
        .then((res) => setDetailData(res))
        .catch(() => setDetailData(null))
        .finally(() => setLoading(false));
    } else {
      setDetailData(null);
    }
  }, [isOpen, player?.id]);

  if (!mounted || !isOpen || !player || typeof document === "undefined") return null;

  // Montagem do gráfico de evolução de preço em SVG
  const historyList = detailData?.history || [];
  const prices = historyList.length > 0
    ? historyList.map((h: any) => h.priceAfter)
    : [player.price];

  // Se houver apenas 1 preço no histórico, adicionamos o preço inicial para criar uma linha
  const plotPrices = prices.length === 1 ? [settings.initialPlayerPrice, prices[0]] : prices;
  const minPrice = Math.min(...plotPrices);
  const maxPrice = Math.max(...plotPrices);
  const span = Math.max(0.5, maxPrice - minPrice);

  const svgPoints = plotPrices
    .map((price: number, idx: number) => {
      const x = plotPrices.length <= 1 ? 50 : (idx / (plotPrices.length - 1)) * 260 + 20;
      const y = 80 - ((price - minPrice) / span) * 55;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const recentPoints = detailData?.recentPointsList || player.recentPointsList || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in touch-none overscroll-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil Cartola de ${player.name}`}
    >
      <div
        className="relative flex w-full max-w-lg max-h-[85vh] flex-col overflow-y-auto rounded-3xl border border-accent/40 bg-[#06160d] p-5 sm:p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header do Jogador */}
        <div className="flex items-center gap-3.5 border-b border-white/10 pb-4">
          <PlayerAvatar
            name={player.name}
            avatarUrl={player.avatarUrl}
            clickable={false}
            className="h-16 w-16 shrink-0 rounded-2xl border-2 border-accent bg-background text-base font-black text-accent shadow-md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-black text-foreground">{player.name}</h2>
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-black uppercase text-accent">
                {player.profile || "Jogador"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {player.goals} gols · {player.assists} assistências · {player.wins} vitórias
            </p>
            {/* Tags Completas */}
            <div className="mt-2 flex flex-wrap gap-1">
              {player.allTags.map((tag) => (
                <span
                  key={tag.type}
                  className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                    tag.variant === "accent"
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : tag.variant === "success"
                      ? "bg-success/20 text-success border border-success/40"
                      : tag.variant === "danger"
                      ? "bg-danger/20 text-danger border border-danger/40"
                      : tag.variant === "warning"
                      ? "bg-warning/20 text-warning border border-warning/40"
                      : tag.variant === "purple"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                      : "bg-white/10 text-muted border border-white/10"
                  }`}
                >
                  {tag.icon} {tag.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Grade de Destaques de Preço e Desempenho */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="text-[8px] font-black uppercase tracking-wider text-muted">Preço Atual</p>
            <p className="mt-1 text-base font-black text-accent">
              {formatFantasyMoney(player.price, settings.currencyName)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="text-[8px] font-black uppercase tracking-wider text-muted">Variação</p>
            <p
              className={`mt-1 text-base font-black flex items-center gap-1 ${
                player.variation >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {player.variation >= 0 ? (
                <TrendingUp className="h-4 w-4 shrink-0" />
              ) : (
                <TrendingDown className="h-4 w-4 shrink-0" />
              )}
              {player.variation > 0 ? "+" : ""}
              {(player.variation * 100).toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="text-[8px] font-black uppercase tracking-wider text-muted">Média</p>
            <p className="mt-1 text-base font-black text-foreground">
              {player.roundsPlayed
                ? (player.totalPoints / player.roundsPlayed).toFixed(1)
                : "0.0"}{" "}
              <span className="text-[9px] font-normal text-muted">pts</span>
            </p>
          </div>
        </div>

        {/* Métricas de Tendência, Forma e Custo-Benefício */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/5 bg-surface/50 p-2.5 text-center">
            <p className="text-[8px] font-black uppercase text-muted">Tendência</p>
            <p className="mt-1 text-xs font-black text-foreground flex items-center justify-center gap-1">
              <span>{player.trendIcon}</span>
              <span>{player.trendLabel}</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface/50 p-2.5 text-center">
            <p className="text-[8px] font-black uppercase text-muted">Forma</p>
            <p className={`mt-1 text-xs font-black flex items-center justify-center gap-1 ${player.formColorClass}`}>
              <span>{player.formIcon}</span>
              <span>{player.formLabel}</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface/50 p-2.5 text-center">
            <p className="text-[8px] font-black uppercase text-muted">Custo-Benefício</p>
            <p className="mt-1 text-xs font-black text-accent flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>{player.costBenefitScore.toFixed(1)}/10</span>
            </p>
          </div>
        </div>

        {/* Gráfico de Evolução de Preço */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3.5">
          <div className="flex items-center justify-between text-xs font-black text-muted">
            <span className="uppercase text-[9px] tracking-wider text-muted flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-accent" /> Evolução de Preço
            </span>
            <span className="text-[9px] text-accent font-bold">
              Min: C$ {minPrice.toFixed(2)} · Max: C$ {maxPrice.toFixed(2)}
            </span>
          </div>

          <div className="relative mt-2 h-24 w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted">
                Carregando gráfico...
              </div>
            ) : (
              <svg
                viewBox="0 0 300 90"
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >
                {/* Linha de Grade Base */}
                <line x1="15" y1="80" x2="285" y2="80" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="15" y1="25" x2="285" y2="25" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3 3" />

                {/* Linha de Tendência */}
                <polyline
                  points={svgPoints}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Pontos nos vértices */}
                {plotPrices.map((p: number, idx: number) => {
                  const x = plotPrices.length <= 1 ? 150 : (idx / (plotPrices.length - 1)) * 260 + 20;
                  const y = 80 - ((p - minPrice) / span) * 55;
                  return (
                    <g key={idx}>
                      <circle cx={x} cy={y} r="4" fill="var(--accent)" stroke="#07170e" strokeWidth="2" />
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Últimas 5 Rodadas */}
        {recentPoints.length > 0 && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-muted">
              Últimas Rodadas Válidas (Pontos)
            </p>
            <div className="mt-2 flex items-center gap-2">
              {recentPoints.map((pts: number, idx: number) => (
                <div
                  key={idx}
                  className={`flex-1 rounded-xl p-2 text-center border ${
                    pts >= 10
                      ? "border-success/40 bg-success/10 text-success"
                      : pts > 0
                      ? "border-accent/30 bg-accent/5 text-foreground"
                      : "border-danger/30 bg-danger/10 text-danger"
                  }`}
                >
                  <p className="text-[8px] font-bold text-muted">R-{recentPoints.length - idx}</p>
                  <p className="text-xs font-black">{pts.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popularidade */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl border border-white/5 bg-surface/40 p-2">
            <span className="text-[8px] uppercase text-muted block">Popularidade</span>
            <strong className="text-sm font-black text-foreground">{player.popularityPercent}%</strong>
            <span className="text-[8px] text-muted block">dos times</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-surface/40 p-2">
            <span className="text-[8px] uppercase text-muted block">Capitão</span>
            <strong className="text-sm font-black text-warning flex items-center justify-center gap-1">
              <Crown className="h-3 w-3 inline" /> {player.captainPercent}%
            </strong>
            <span className="text-[8px] text-muted block">escolheram</span>
          </div>
        </div>

        {/* Ação no Mercado */}
        {isMarketOpen && onToggleBuy && (
          <button
            type="button"
            onClick={() => {
              onToggleBuy(player);
              onClose();
            }}
            className={`mt-5 w-full rounded-2xl py-3.5 text-xs font-black uppercase tracking-wider shadow-lg transition-transform active:scale-95 ${
              isBought
                ? "border border-danger/40 bg-danger/20 text-danger hover:bg-danger/30"
                : "bg-accent text-background shadow-[0_0_20px_rgba(204,255,0,0.25)] hover:brightness-110"
            }`}
          >
            {isBought ? "Vender este Jogador" : `Comprar por C$ ${player.price.toFixed(2)}`}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
