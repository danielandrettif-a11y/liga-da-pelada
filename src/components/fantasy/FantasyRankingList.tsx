"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type { FantasyRoundLineupOverview } from "@/lib/actions/fantasy";
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
};

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
              confirmed.map((item, index) => (
                <div
                  key={item.userId}
                  className={`glass-card flex items-center gap-3 p-3.5 ${
                    item.isCurrentUser ? "border-accent/40 bg-accent/5" : ""
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success/15 text-xs font-black text-success">
                    {index + 1}
                  </span>
                  <PlayerAvatar
                    name={item.playerName}
                    avatarUrl={item.avatarUrl}
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
              ))
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

  return (
    <div className="space-y-2">
      {ranking.some((item) => item.is_live) && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black text-accent">
          <span>● PRÉVIA AO VIVO</span>
          <button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} className="flex items-center gap-1 disabled:opacity-50"><RotateCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>
      )}
      {ranking.map((item) => (
        <Link
          key={item.id}
          href={item.user_id
            ? scope === "round" && item.round_id
              ? `/cartola/ranking/${item.user_id}/${item.round_id}`
              : `/cartola/ranking/${item.user_id}`
            : "/cartola/ranking"}
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
