"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Crown, Medal, RotateCcw } from "@/components/icons";
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

function podiumStyle(position: number) {
  if (position === 1) return {
    ring: "border-[#f5cf52] shadow-[0_0_24px_rgba(245,207,82,.28)]",
    base: "from-[#866714]/80 via-[#4f3c08]/70 to-[#211a05]/80 border-[#d5ad38]/50",
    medal: "from-[#fff0a8] via-[#e0b83d] to-[#9d7217] text-[#3b2b07]",
    label: "text-[#f5d45e]",
  };
  if (position === 2) return {
    ring: "border-slate-300 shadow-[0_0_20px_rgba(203,213,225,.18)]",
    base: "from-slate-400/40 via-slate-600/25 to-slate-900/40 border-slate-300/30",
    medal: "from-white via-slate-300 to-slate-500 text-slate-800",
    label: "text-slate-300",
  };
  return {
    ring: "border-[#c47a43] shadow-[0_0_20px_rgba(196,122,67,.18)]",
    base: "from-[#9b542a]/45 via-[#5b2c17]/35 to-[#271109]/60 border-[#b86d3b]/40",
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
  if (ranking.length === 0) {
    return (
      <p className="glass-card p-6 text-center text-sm text-muted">
        O ranking aparecerá assim que alguém salvar a escalação para a rodada.
      </p>
    );
  }

  const podium = ranking.slice(0, 3);
  const showPodium = podium.length === 3;
  const podiumOrder = showPodium ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <div className="space-y-3">
      {ranking.some((item) => item.is_live) && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black text-accent">
          <span>● PRÉVIA AO VIVO</span>
          <button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} className="flex items-center gap-1 disabled:opacity-50"><RotateCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>
      )}
      {showPodium && (
        <section className="pt-7" aria-label="Pódio do Cartola">
          <div className="flex items-end justify-center gap-2 sm:gap-4">
            {podiumOrder.map((item, visualIndex) => {
              const position = visualIndex === 0 ? 2 : visualIndex === 1 ? 1 : 3;
              const style = podiumStyle(position);
              const height = position === 1 ? "h-36" : position === 2 ? "h-28" : "h-24";
              return (
                <Link
                  key={item.id}
                  href={rankingHref(item, scope)}
                  className="relative flex w-1/3 max-w-[112px] flex-col items-center rounded-t-2xl transition-transform hover:-translate-y-1 focus:outline-none animate-slide-in-bottom"
                  aria-label={`Abrir perfil de ${item.player?.name || "Cartoleiro"}, ${position}º lugar`}
                >
                  {position === 1 && <Crown className="absolute -top-8 h-8 w-8 rotate-[-7deg] text-[#f5d45e] drop-shadow-lg" fill="currentColor" />}
                  <div className="relative z-10">
                    <PlayerAvatar
                      name={item.player?.name || "Cartoleiro"}
                      avatarUrl={item.player?.avatar_url}
                      frameKey={item.cosmetics?.frameKey}
                      auraKey={item.cosmetics?.auraKey}
                      className={`h-16 w-16 rounded-full border-[3px] bg-background text-sm font-black text-muted ${style.ring}`}
                    />
                    <span className={`absolute -bottom-2 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br ${style.medal} shadow-lg`}>
                      {position === 1 ? <Crown className="h-4 w-4" fill="currentColor" /> : <Medal className="h-4 w-4" fill="currentColor" />}
                    </span>
                  </div>
                  <div className="mb-2 mt-4 w-full px-1 text-center">
                    <p className="truncate text-xs font-black text-foreground">{item.player?.name || "Cartoleiro"}</p>
                    <p className={`mt-1 text-xs font-black ${style.label}`}>{Number(item.total_points).toFixed(1)} <span className="text-[8px] uppercase opacity-70">pts</span></p>
                    <p className="mt-0.5 truncate text-[8px] font-bold text-muted">C$ {Number(item.current_budget).toFixed(2)}</p>
                  </div>
                  <div className={`w-full rounded-t-2xl border-x border-t bg-gradient-to-b pt-3 ${height} ${style.base}`}>
                    <span className="font-athletic text-3xl font-black text-white/45">{position}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {(showPodium ? ranking.slice(3) : ranking).map((item) => (
        <Link
          key={item.id}
          href={rankingHref(item, scope)}
          className="glass-card flex items-center gap-3 p-4 transition-colors hover:bg-surface-hover"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
              item.position <= 3 ? "bg-accent text-background" : "bg-surface text-muted"
            }`}
          >
            {item.position}
          </span>
          <PlayerAvatar
            name={item.player?.name || "Cartoleiro"}
            avatarUrl={item.player?.avatar_url}
            frameKey={item.cosmetics?.frameKey}
            auraKey={item.cosmetics?.auraKey}
            className="h-10 w-10 shrink-0 rounded-full bg-surface text-xs font-black text-accent"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-foreground">{item.player?.name || "Cartoleiro"}</p>
            <p className="text-[10px] text-muted">
              {Number(item.rounds_played)} {Number(item.rounds_played) === 1 ? "rodada" : "rodadas"} · patrimônio C${" "}
              {Number(item.current_budget).toFixed(2)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <strong className="stat-number text-lg text-accent">{Number(item.total_points).toFixed(1)}</strong>
            <p className="text-[8px] font-black uppercase text-muted">{item.is_live ? "prévia" : "pontos"}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
