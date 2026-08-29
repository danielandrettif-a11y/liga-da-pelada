"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  ChevronDown,
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
  isRoundLive?: boolean;
  liveRevision?: string;
};

export function FantasyPlayerDrawer({
  player,
  settings,
  isOpen,
  onClose,
  onToggleBuy,
  isBought = false,
  isMarketOpen = true,
  isRoundLive = false,
  liveRevision,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "scouts">("overview");

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
  }, [isOpen, liveRevision, player?.id]);

  useEffect(() => {
    // Se a rodada estiver ao vivo e o modal acabou de abrir, começa na aba de scouts se houver scouts
    if (isRoundLive) {
      setActiveTab("scouts");
    } else {
      setActiveTab("overview");
    }
  }, [isRoundLive, player?.id, isOpen]);

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
  const liveRound = detailData?.liveRound;
  const livePoints = Number(liveRound?.basePoints ?? player.roundPoints ?? 0);
  const breakdownList = liveRound?.breakdown || [];
  const matchesList = liveRound?.matchesBreakdown || [];
  const rulesList = liveRound?.rulesList || [];

  return createPortal(
    <div
      className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil Cartola de ${player.name}`}
    >
      <div
        className="relative flex w-full max-w-lg max-h-[88vh] flex-col overflow-y-auto rounded-3xl border border-accent/40 bg-[#06160d] p-5 sm:p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto touch-auto overscroll-contain"
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
            {isRoundLive && (
              <p className="mt-1 inline-flex rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-accent">
                Ao vivo · {livePoints.toFixed(1)} pts
              </p>
            )}
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

        {/* Abas Superiores de Navegação */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all ${
              activeTab === "overview"
                ? "bg-accent text-background shadow-[0_0_15px_rgba(204,255,0,0.3)]"
                : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" /> Visão Geral
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scouts")}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all ${
              activeTab === "scouts"
                ? "bg-accent text-background shadow-[0_0_15px_rgba(204,255,0,0.3)]"
                : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>🎯 Pontuação & Scouts</span>
              {isRoundLive && (
                <span className={`h-2 w-2 rounded-full ${activeTab === "scouts" ? "bg-background animate-ping" : "bg-accent animate-pulse"}`} />
              )}
            </span>
          </button>
        </div>

        {/* CONTEÚDO DA ABA 1: VISÃO GERAL & MERCADO */}
        {activeTab === "overview" && (
          <div className="animate-fade-in space-y-3 pt-2">
            {/* Grade de Destaques de Preço e Desempenho */}
            <div className="grid grid-cols-3 gap-2">
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
            <div className="grid grid-cols-3 gap-2">
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

            {/* Histórico no Rodízio do Gol */}
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">🧤 Histórico no rodízio do gol</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted">Use estes números para decidir sua aposta na vaga GOL.</p>
                </div>
                {player.goalkeeperGames > 0 ? (
                  <div className="shrink-0 text-right text-xs">
                    <p className="font-black text-foreground">{player.goalkeeperGames} {player.goalkeeperGames === 1 ? "jogo" : "jogos"}</p>
                    <p className="text-[9px] font-bold text-accent">{player.goalkeeperConcededAverage?.toFixed(2)} sofridos/jogo</p>
                  </div>
                ) : <span className="shrink-0 text-[10px] font-bold text-muted">Sem histórico</span>}
              </div>
              {player.goalkeeperGames > 0 && (
                <div className="mt-2 border-t border-emerald-400/15 pt-2 text-xs font-bold text-emerald-100">
                  {player.goalsConceded} {player.goalsConceded === 1 ? "gol tomado" : "gols tomados"} em {player.goalkeeperGames} {player.goalkeeperGames === 1 ? "partida" : "partidas"} no gol.
                </div>
              )}
            </div>

            {/* Gráfico de Evolução de Preço */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5">
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

            {/* Últimas Rodadas */}
            {recentPoints.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
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
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
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
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: PONTUAÇÃO & SCOUTS DESTRINCHADOS */}
        {activeTab === "scouts" && (
          <div className="animate-fade-in space-y-4 pt-2">
            {/* Hero Card de Pontuação Atual / Rodada */}
            <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 via-[#0c2214] to-black/60 p-4 shadow-[0_0_30px_rgba(204,255,0,0.1)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-accent">
                      {liveRound?.roundNumber ? `Rodada ${liveRound.roundNumber} · Ao Vivo` : isRoundLive ? "Rodada Atual · Ao Vivo" : "Desempenho da Rodada"}
                    </span>
                  </div>
                  <h3 className="mt-1 text-sm font-black text-foreground">
                    Pontuação Destrinchada
                  </h3>
                </div>
                <div className="text-right">
                  <span className="block text-2xl font-black text-accent drop-shadow-[0_0_10px_rgba(204,255,0,0.4)]">
                    {livePoints.toFixed(1)}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
                    Pontos-base
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted border-t border-accent/15 pt-2">
                Valores calculados em tempo real a partir dos scouts e eventos de jogo. O bônus de capitão e cartas especiais incidem no total da sua escalação.
              </p>
            </div>

            {/* Lista Destrinchada de Scouts */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <span>⚡ Scouts e Ações na Rodada</span>
                </span>
                <span className="text-[9px] font-bold text-muted">
                  Subtotal
                </span>
              </div>

              {loading && !liveRound ? (
                <div className="py-6 text-center text-xs text-muted">
                  Carregando scouts da rodada...
                </div>
              ) : breakdownList.length > 0 ? (
                <div className="mt-3 divide-y divide-white/5 space-y-2">
                  {breakdownList.map((item: any) => (
                    <div key={item.key || item.label} className="flex items-center justify-between gap-3 pt-2 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{item.icon || "⚽"}</span>
                          <span className="truncate text-xs font-black text-foreground">{item.label}</span>
                          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                            {item.count}x
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {item.unitPoints != null ? `${item.count} × ${item.unitPoints > 0 ? "+" : ""}${Number(item.unitPoints).toFixed(1)} pts cada` : `${item.count} ocorrências`}
                        </p>
                      </div>
                      <strong className={`text-sm font-black shrink-0 ${item.points < 0 ? "text-danger" : "text-accent"}`}>
                        {item.points > 0 ? "+" : ""}{Number(item.points).toFixed(1)} pts
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-xs font-semibold text-muted">
                    Nenhum scout pontuado registrado para este atleta nesta rodada ainda.
                  </p>
                  <p className="mt-1 text-[10px] text-muted/70">
                    Gols, assistências, vitórias e participações aparecerão aqui assim que as partidas forem disputadas.
                  </p>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-accent/20 pt-2.5 text-xs font-black">
                <span className="text-foreground uppercase text-[10px]">Total dos Scouts</span>
                <span className="text-sm text-accent font-black">
                  {livePoints > 0 ? "+" : ""}{livePoints.toFixed(1)} pts
                </span>
              </div>
            </div>

            {/* Partidas Disputadas pelo Jogador na Rodada */}
            {matchesList.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-accent pb-2 border-b border-white/10">
                  🏟️ Partidas do Atleta na Rodada
                </p>
                <div className="mt-3 space-y-2">
                  {matchesList.map((m: any) => (
                    <div key={m.matchId || m.matchIndex} className="rounded-xl border border-white/5 bg-surface/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-muted">
                            Jogo #{m.matchIndex}
                          </span>
                          <strong className="text-xs font-black text-foreground">{m.scoreFormatted}</strong>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                          m.result === "win"
                            ? "bg-success/20 text-success border border-success/40"
                            : m.result === "loss"
                            ? "bg-danger/20 text-danger border border-danger/40"
                            : m.result === "draw"
                            ? "bg-warning/20 text-warning border border-warning/40"
                            : "bg-accent/20 text-accent border border-accent/40"
                        }`}>
                          {m.result === "win" ? "🏆 Vitória" : m.result === "loss" ? "❌ Derrota" : m.result === "draw" ? "⚖️ Empate" : "🟢 Em jogo"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-muted">
                        {m.goals > 0 && <span className="text-accent">⚽ {m.goals} {m.goals === 1 ? "gol" : "gols"}</span>}
                        {m.assists > 0 && <span className="text-emerald-400">👟 {m.assists} {m.assists === 1 ? "assistência" : "assistências"}</span>}
                        {m.isGoalkeeper && <span className="text-blue-400">🧤 No gol ({m.goalsConcededInMatch} {m.goalsConcededInMatch === 1 ? "sofrido" : "sofridos"})</span>}
                        {m.ownGoals > 0 && <span className="text-danger">⚠️ {m.ownGoals} gol contra</span>}
                        {!m.goals && !m.assists && !m.isGoalkeeper && !m.ownGoals && <span>Participou da partida</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regras e Tabela de Pesos do Perfil */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted">
                  📋 Tabela de Regras · {player.profile || "Jogador"}
                </span>
                <span className="text-[9px] font-bold text-accent">
                  Regulamento
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {(rulesList.length > 0 ? rulesList : [
                  { label: "Gol marcado", unitPoints: settings.goalPoints, icon: "⚽" },
                  { label: "Assistência", unitPoints: settings.assistPoints, icon: "👟" },
                  { label: "Vitória na partida", unitPoints: settings.winPoints, icon: "🏆" },
                  { label: "Derrota na partida", unitPoints: settings.lossPoints, icon: "❌" },
                  { label: "Jogar no gol", unitPoints: settings.goalkeeperAppearancePoints, icon: "🧤" },
                  { label: "Gol sofrido no gol", unitPoints: settings.goalConcededPoints, icon: "🛡️" },
                  { label: "Gol contra", unitPoints: settings.ownGoalPoints, icon: "⚠️" },
                ]).map((rule: any) => (
                  <div key={rule.label} className="rounded-xl border border-white/5 bg-surface/30 p-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[10px] font-bold text-muted flex items-center gap-1">
                        <span>{rule.icon || "•"}</span> {rule.label}
                      </span>
                      <strong className={`text-[11px] font-black shrink-0 ${Number(rule.unitPoints) < 0 ? "text-danger" : "text-accent"}`}>
                        {Number(rule.unitPoints) > 0 ? "+" : ""}{Number(rule.unitPoints).toFixed(1)}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
