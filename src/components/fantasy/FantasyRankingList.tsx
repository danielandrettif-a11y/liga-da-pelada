"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Crown, RotateCcw } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type { FantasyRoundLineupOverview } from "@/lib/actions/fantasy";
import { cosmeticImage } from "@/lib/fantasy/cosmetics";
import { supabase } from "@/lib/supabase";

export type FantasyRankingEntry = {
  id: string;
  position: number;
  rounds_played: number | string;
  current_budget: number | string;
  total_points: number | string;
  best_round_points?: number | string;
  captain_bonus_points?: number | string;
  def_points?: number | string;
  mid_points?: number | string;
  attack_points?: number | string;
  player: {
    name: string;
    avatar_url: string | null;
  } | null;
  user_id?: string;
  round_id?: string | null;
  is_live?: boolean;
  cosmetics?: {
    frameKey: string | null;
    auraKey: string | null;
    backgroundAssetKey: string | null;
  } | null;
};

type FantasyRankingFilter = "points" | "budget" | "captain" | "def" | "mid" | "attack" | "best";

type FantasyRankingMetric = {
  id: FantasyRankingFilter;
  label: string;
  title: string;
  description: string;
  valueLabel: string;
  field: keyof Pick<
    FantasyRankingEntry,
    "total_points" | "current_budget" | "best_round_points" | "captain_bonus_points" | "def_points" | "mid_points" | "attack_points"
  >;
  currency?: boolean;
};

const FANTASY_RANKING_METRICS: FantasyRankingMetric[] = [
  { id: "points", label: "Geral", title: "Pódio dos Cartoleiros", description: "Pontuação total da temporada", valueLabel: "pontos", field: "total_points" },
  { id: "budget", label: "Cartoletas", title: "Reis das Cartoletas", description: "Maior patrimônio atual", valueLabel: "cartoletas", field: "current_budget", currency: true },
  { id: "captain", label: "Capitão", title: "Mestres da Faixa", description: "Mais pontos extras com o capitão", valueLabel: "bônus capitão", field: "captain_bonus_points" },
  { id: "def", label: "DEF", title: "Muralha do Cartola", description: "Mais pontos com atletas na DEF", valueLabel: "pontos DEF", field: "def_points" },
  { id: "mid", label: "MEI", title: "Donos do Meio", description: "Mais pontos com atletas no MEI", valueLabel: "pontos MEI", field: "mid_points" },
  { id: "attack", label: "ATA", title: "Ataque dos Sonhos", description: "Mais pontos com atletas no ATA", valueLabel: "pontos ATA", field: "attack_points" },
  { id: "best", label: "Recorde", title: "Rodadas Históricas", description: "Melhor rodada individual de cada usuário", valueLabel: "melhor rodada", field: "best_round_points" },
];

function metricValue(item: FantasyRankingEntry, metric: FantasyRankingMetric) {
  return Number(item[metric.field] || 0);
}

function formattedMetricValue(item: FantasyRankingEntry, metric: FantasyRankingMetric) {
  const value = metricValue(item, metric);
  return metric.currency ? `C$ ${value.toFixed(2)}` : value.toFixed(1);
}

function podiumStyle(position: number) {
  if (position === 1) return {
    card: "border-amber-300/60 bg-gradient-to-b from-amber-300/20 via-[#15210d] to-[#06130b] shadow-[0_18px_38px_rgba(245,190,45,.14)]",
    ring: "border-amber-200 bg-amber-300/20 shadow-[0_0_24px_rgba(245,207,82,.3)]",
    base: "border-amber-300/35 bg-gradient-to-b from-amber-300/25 to-amber-950/35",
    medal: "from-[#fff0a8] via-[#e0b83d] to-[#9d7217] text-[#3b2b07]",
    label: "text-[#f5d45e]",
  };
  if (position === 2) return {
    card: "border-slate-300/45 bg-gradient-to-b from-slate-300/15 via-[#102019] to-[#06130b] shadow-[0_16px_32px_rgba(203,213,225,.08)]",
    ring: "border-slate-200 bg-slate-300/15 shadow-[0_0_20px_rgba(203,213,225,.2)]",
    base: "border-slate-300/25 bg-gradient-to-b from-slate-300/20 to-slate-900/35",
    medal: "from-white via-slate-300 to-slate-500 text-slate-800",
    label: "text-slate-300",
  };
  return {
    card: "border-orange-400/40 bg-gradient-to-b from-orange-400/15 via-[#151d13] to-[#06130b] shadow-[0_16px_32px_rgba(196,122,67,.08)]",
    ring: "border-orange-300 bg-orange-400/15 shadow-[0_0_20px_rgba(196,122,67,.2)]",
    base: "border-orange-400/25 bg-gradient-to-b from-orange-400/20 to-orange-950/35",
    medal: "from-[#efbc91] via-[#b96d39] to-[#713619] text-[#32160a]",
    label: "text-[#d98a50]",
  };
}

function rankingHref(item: FantasyRankingEntry, scope: "general" | "round") {
  if (!item.user_id) return "/cartola/ranking";
  return scope === "round" && item.round_id
    ? `/cartola/ranking/${item.user_id}/${item.round_id}`
    : `/cartola/ranking/${item.user_id}`;
}

function FantasyPodium({ ranking, scope, metric }: { ranking: FantasyRankingEntry[]; scope: "general" | "round"; metric: FantasyRankingMetric }) {
  const podium = ranking.slice(0, 3);
  if (podium.length < 3) return null;
  const podiumOrder = [podium[1], podium[0], podium[2]];

  return (
    <section
      className="relative isolate overflow-hidden rounded-[1.75rem] border border-accent/30 bg-[radial-gradient(circle_at_50%_0%,rgba(204,255,0,.16),transparent_42%),linear-gradient(160deg,#071b10,#031008_72%)] px-2.5 pb-3 pt-4 shadow-[0_20px_45px_rgba(0,0,0,.28)]"
      aria-label="Pódio do Cartola"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(204,255,0,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(204,255,0,.08)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative mb-8 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/12 text-accent">
            <Crown className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-athletic text-sm font-black uppercase tracking-wider text-foreground">{metric.title}</h2>
            <p className="truncate text-[9px] font-bold uppercase tracking-[.12em] text-accent/75">{metric.description}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-accent/25 bg-black/30 px-2 py-1 text-[8px] font-black uppercase text-accent">Top 3</span>
      </div>

      <div className="relative grid grid-cols-3 items-end gap-1.5 sm:gap-2.5">
        {podiumOrder.map((item, visualIndex) => {
          const position = visualIndex === 0 ? 2 : visualIndex === 1 ? 1 : 3;
          const style = podiumStyle(position);
          const avatarSize = position === 1 ? "h-[4.5rem] w-[4.5rem]" : "h-16 w-16";
          const backgroundImage = cosmeticImage(item.cosmetics?.backgroundAssetKey);
          return (
            <Link
              key={item.id}
              href={rankingHref(item, scope)}
              className={`group relative min-w-0 overflow-hidden rounded-[1.35rem] border px-1.5 pb-1.5 pt-5 text-center transition-transform duration-300 ease-out hover:-translate-y-1 active:scale-[.98] motion-reduce:transform-none motion-reduce:transition-none ${position === 1 ? "min-h-[224px]" : "min-h-[200px]"} ${style.card}`}
              aria-label={`Abrir perfil de ${item.player?.name || "Cartoleiro"}, ${position}º lugar`}
            >
              {backgroundImage && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `linear-gradient(rgba(3,16,8,.18),rgba(3,16,8,.9)),url(${backgroundImage})` }} />}
              <span className={`absolute left-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-black shadow-lg ${style.medal}`}>
                {position}
              </span>
              {position === 1 && <Crown className="absolute left-1/2 top-1 z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] text-amber-300 drop-shadow-lg" fill="currentColor" />}

              <div className="relative z-10 flex flex-col items-center">
                <div className={`relative flex items-center justify-center rounded-full border-2 p-1 ${style.ring}`}>
                  <PlayerAvatar
                    name={item.player?.name || "Cartoleiro"}
                    avatarUrl={item.player?.avatar_url}
                    frameKey={item.cosmetics?.frameKey}
                    auraKey={item.cosmetics?.auraKey}
                    className={`${avatarSize} rounded-full bg-[#0c2517] text-xs font-black text-accent`}
                  />
                </div>
                <p className="mt-2 line-clamp-2 min-h-8 w-full text-[10px] font-black leading-4 text-foreground sm:text-xs">{item.player?.name || "Cartoleiro"}</p>
                <p className={`mt-0.5 whitespace-nowrap font-athletic text-base font-black leading-none sm:text-lg ${style.label}`}>{formattedMetricValue(item, metric)}</p>
                <p className="mt-0.5 line-clamp-1 text-[7px] font-black uppercase tracking-wider text-muted">{metric.valueLabel}</p>
                <span className="mt-2 max-w-full truncate rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[8px] font-black text-emerald-200">
                  {metric.id === "budget" ? `${Number(item.total_points).toFixed(1)} pts` : `C$ ${Number(item.current_budget).toFixed(2)}`}
                </span>
              </div>

              <div className={`relative z-10 mt-2 rounded-xl border py-1.5 ${style.base}`}>
                <span className="font-athletic text-lg font-black text-white/70">{position}º</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function FantasyRankingList({
  ranking,
  roundOverview,
  scope = "general",
}: {
  ranking: FantasyRankingEntry[];
  roundOverview?: FantasyRoundLineupOverview | null;
  scope?: "general" | "round";
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"confirmed" | "pending">("confirmed");
  const [rankingFilter, setRankingFilter] = useState<FantasyRankingFilter>("points");
  const [refreshing, startRefresh] = useTransition();
  const refreshTimer = useRef<number | null>(null);
  const refresh = useCallback((delay = 0) => {
    if (refreshTimer.current) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, delay);
  }, [router]);

  useEffect(() => {
    const channel = supabase
      .channel(`fantasy-ranking-${scope}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, () => refresh(250))
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => refresh(250))
      .subscribe();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15_000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [refresh, scope]);

  const activeMetric = FANTASY_RANKING_METRICS.find((metric) => metric.id === rankingFilter) || FANTASY_RANKING_METRICS[0];
  const displayedRanking = useMemo(() => {
    if (scope !== "general") return ranking;
    const sorted = [...ranking].sort((a, b) =>
      metricValue(b, activeMetric) - metricValue(a, activeMetric)
      || Number(b.total_points) - Number(a.total_points)
      || (a.player?.name || "").localeCompare(b.player?.name || "", "pt-BR")
    );
    let previousValue: number | null = null;
    let previousPosition = 0;
    return sorted.map((item, index) => {
      const value = metricValue(item, activeMetric);
      const position = previousValue === value ? previousPosition : index + 1;
      previousValue = value;
      previousPosition = position;
      return { ...item, position };
    });
  }, [activeMetric, ranking, scope]);

  // Se o escopo for rodada e a rodada estiver aberta para escalação
  if (scope === "round" && roundOverview?.isRoundOpen) {
    const { confirmed, pending, confirmedCount, pendingCount, roundNumber } = roundOverview;

    return (
      <div className="space-y-4">
        {/* Banner de status da rodada aberta */}
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs font-semibold text-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" />
            <strong className="text-accent uppercase tracking-wider font-black">
              {roundNumber ? `Rodada ${String(roundNumber).padStart(2, "0")} em Aberto` : "Rodada em Aberto"}
            </strong>
          </div>
          <p className="mt-1.5 text-muted leading-relaxed">
            Acompanhe em tempo real quem já escalou e salvou o time para a rodada. Logo após salvar no Cartola, o nome aparece como confirmado aqui.
          </p>
        </div>

        {/* Abas de alternância entre Confirmados e Pendentes */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("confirmed")}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
              activeTab === "confirmed"
                ? "bg-success text-background shadow-[0_0_20px_rgba(34,197,94,.2)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            Já Salvaram ({confirmedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
              activeTab === "pending"
                ? "bg-warning text-background shadow-[0_0_20px_rgba(234,179,8,.2)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            Faltam Escalar ({pendingCount})
          </button>
        </div>

        {/* Lista de Confirmados */}
        {activeTab === "confirmed" && (
          <div className="space-y-2">
            {confirmed.length === 0 ? (
              <div className="glass-card p-6 text-center text-sm text-muted">
                Nenhum cartoleiro salvou o time para esta rodada ainda. Seja o primeiro!
              </div>
            ) : (
              confirmed.map((item, index) => {
                const backgroundImage = cosmeticImage(item.cosmetics?.backgroundAssetKey);
                return (
                  <div
                    key={item.userId}
                    className={`glass-card relative overflow-hidden ${item.isCurrentUser ? "border-accent/40 bg-accent/5" : ""}`}
                  >
                    {backgroundImage && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-65" style={{ backgroundImage: `linear-gradient(rgba(3, 15, 8, .24), rgba(3, 15, 8, .74)), url(${backgroundImage})` }} />}
                    <div className="relative flex items-center gap-3 p-3.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success/15 text-xs font-black text-success">
                        {index + 1}
                      </span>
                      <PlayerAvatar
                        name={item.playerName}
                        avatarUrl={item.avatarUrl}
                        frameKey={item.cosmetics?.frameKey}
                        auraKey={item.cosmetics?.auraKey}
                        className="h-10 w-10 shrink-0 rounded-full bg-surface text-xs font-black text-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-black text-foreground">{item.playerName}</p>
                          {item.isCurrentUser && (
                            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[8px] font-black uppercase text-accent">
                              Você
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted">
                          {item.savedAt
                            ? `Escalação salva em ${new Intl.DateTimeFormat("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(item.savedAt))}`
                            : "Escalação confirmada"}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[9px] font-black uppercase text-success">
                        <CheckCircle2 className="h-3 w-3" /> Escalado
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Lista de Pendentes */}
        {activeTab === "pending" && (
          <div className="space-y-2">
            {pending.length === 0 ? (
              <div className="glass-card p-6 text-center text-sm text-muted">
                Todos os participantes já escalaram o time para esta rodada! 🚀
              </div>
            ) : (
              pending.map((item, index) => (
                <div
                  key={item.userId}
                  className={`glass-card flex items-center gap-3 p-3.5 opacity-85 ${
                    item.isCurrentUser ? "border-warning/40 bg-warning/5" : ""
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface text-xs font-black text-muted">
                    {index + 1}
                  </span>
                  <PlayerAvatar
                    name={item.playerName}
                    avatarUrl={item.avatarUrl}
                    frameKey={item.cosmetics?.frameKey}
                    auraKey={item.cosmetics?.auraKey}
                    className="h-10 w-10 shrink-0 rounded-full bg-surface text-xs font-black text-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-black text-foreground">{item.playerName}</p>
                      {item.isCurrentUser && (
                        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[8px] font-black uppercase text-warning">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted">Ainda não enviou escalação</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[9px] font-black uppercase text-warning">
                    <Clock className="h-3 w-3" /> Pendente
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // Visualização de Ranking tradicional (geral ou rodada concluída)
  if (displayedRanking.length === 0) {
    return (
      <p className="glass-card p-6 text-center text-sm text-muted">
        O ranking aparecerá assim que alguém salvar a escalação para a rodada.
      </p>
    );
  }

  const showPodium = displayedRanking.length >= 3;

  return (
    <div className="space-y-3">
      {ranking.some((item) => item.is_live) && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black text-accent">
          <span>● PRÉVIA AO VIVO</span>
          <button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} className="flex items-center gap-1 disabled:opacity-50"><RotateCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>
      )}
      {scope === "general" && (
        <section className="overflow-hidden rounded-2xl border border-accent/20 bg-[#06150d]/90 p-2.5 shadow-[0_12px_30px_rgba(0,0,0,.18)]" aria-label="Filtros do ranking do Cartola">
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-accent">Escolha o ranking</p>
              <p className="text-[10px] text-muted">{activeMetric.description}</p>
            </div>
            <span className="shrink-0 rounded-full border border-accent/20 bg-accent/[.08] px-2 py-1 text-[8px] font-black uppercase text-accent">Temporada</span>
          </div>
          <div className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FANTASY_RANKING_METRICS.map((metric) => (
              <button
                key={metric.id}
                type="button"
                onClick={() => setRankingFilter(metric.id)}
                aria-pressed={rankingFilter === metric.id}
                className={`shrink-0 snap-start rounded-xl border px-3 py-2 text-[10px] font-black transition-all duration-300 ease-out motion-reduce:transition-none ${
                  rankingFilter === metric.id
                    ? "border-accent bg-accent text-background shadow-[0_8px_20px_rgba(204,255,0,.15)]"
                    : "border-white/10 bg-black/20 text-muted hover:border-accent/30 hover:text-foreground"
                }`}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {showPodium && <FantasyPodium ranking={displayedRanking} scope={scope} metric={activeMetric} />}
      {(showPodium ? displayedRanking.slice(3) : displayedRanking).map((item) => {
        const backgroundImage = cosmeticImage(item.cosmetics?.backgroundAssetKey);
        return (
            <Link
              key={item.id}
              href={rankingHref(item, scope)}
              className="group relative block overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-[#092016] via-[#07170f] to-[#05110b] shadow-[0_10px_24px_rgba(0,0,0,.16)] transition-all duration-300 ease-out hover:border-accent/40 hover:brightness-110 active:scale-[.99] motion-reduce:transition-none"
            >
              {backgroundImage && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `linear-gradient(90deg,rgba(4,17,10,.5),rgba(4,17,10,.92)),url(${backgroundImage})` }} />}
              <div className="relative flex items-center gap-3 p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/[.08] font-athletic text-base font-black text-accent/80">
                  {item.position}
                </span>
                <div className="shrink-0 rounded-full border border-accent/35 bg-accent/10 p-0.5 shadow-[0_0_16px_rgba(204,255,0,.08)]">
                  <PlayerAvatar
                    name={item.player?.name || "Cartoleiro"}
                    avatarUrl={item.player?.avatar_url}
                    frameKey={item.cosmetics?.frameKey}
                    auraKey={item.cosmetics?.auraKey}
                    className="h-11 w-11 rounded-full bg-[#102819] text-xs font-black text-accent"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">{item.player?.name || "Cartoleiro"}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {activeMetric.id === "points"
                      ? <>{Number(item.rounds_played)} {Number(item.rounds_played) === 1 ? "rodada" : "rodadas"} · <span className="text-emerald-200">C$ {Number(item.current_budget).toFixed(2)}</span></>
                      : <>{activeMetric.description} · <span className="text-emerald-200">{activeMetric.id === "budget" ? `${Number(item.total_points).toFixed(1)} pts` : `C$ ${Number(item.current_budget).toFixed(2)}`}</span></>}
                  </p>
                </div>
                <div className="shrink-0 rounded-xl border border-accent/15 bg-black/25 px-2.5 py-1.5 text-right">
                  <strong className="stat-number whitespace-nowrap text-base text-accent sm:text-lg">{formattedMetricValue(item, activeMetric)}</strong>
                  <p className="text-[7px] font-black uppercase tracking-wider text-muted">{item.is_live && activeMetric.id !== "budget" ? "prévia" : activeMetric.valueLabel}</p>
                </div>
              </div>
            </Link>
        );
      })}
    </div>
  );
}
