"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarPlus,
  CalendarDays,
  ChevronRight,
  Clock,
  Football,
  MapPin,
  Trophy,
  Users,
  X,
} from "@/components/icons";
import { BQTheBestButton } from "@/components/BQTheBestButton";
import { WeatherBadge } from "@/components/WeatherBadge";
import type { MonthlyAwardWinner } from "@/lib/monthly-awards";
import { useDialogViewport } from "@/lib/useDialogViewport";
import type { EventWeather } from "@/lib/weather";

type NextRound = {
  id: string;
  number: number;
  date: string;
  start_time?: string | null;
  status: "draft" | "active" | "finished";
  preparation_stage?: "prelist" | "teams_ready";
  confirmedPlayers?: number;
};

export function NextRoundBanner({
  round,
  isAdmin = false,
  venue,
  eventDurationMinutes = 120,
  weather,
  awardsPeriodStart,
  awardWinners = [],
}: {
  round: NextRound | null;
  isAdmin?: boolean;
  venue?: { name?: string | null; mapUrl?: string | null } | null;
  eventDurationMinutes?: number;
  weather?: EventWeather | null;
  awardsPeriodStart: string;
  awardWinners?: MonthlyAwardWinner[];
}) {
  const [showAdminActions, setShowAdminActions] = useState(false);
  const [mounted, setMounted] = useState(false);
  useDialogViewport(showAdminActions, () => setShowAdminActions(false));

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPrelist = round?.preparation_stage === "prelist";
  // O dashboard só entrega rodadas ainda não concluídas (rascunho ou ativa).
  // Portanto, qualquer rodada presente aqui já é a rodada atual do usuário.
  const hasCurrentRound = Boolean(round);
  const canOpenNewRound = isAdmin && !hasCurrentRound;
  const confirmedCount = round?.confirmedPlayers || 0;

  const href = "/rodadas";

  const formattedDate = round
    ? new Date(`${round.date}T00:00:00`).toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
    : null;
  const formattedTime = round?.start_time?.slice(0, 5) || null;

  return (
    <>
    <article className="group relative isolate flex h-full min-h-[370px] sm:min-h-[440px] flex-col justify-between overflow-hidden rounded-[2rem] border border-amber-500/30 bg-[#040f08] p-5 sm:p-6 shadow-[0_25px_65px_rgba(0,0,0,.65),0_0_35px_rgba(245,158,11,.12)]">
      {/* Link de cobertura em todo o banner */}
      {isAdmin ? (
        <button
          type="button"
          onClick={() => setShowAdminActions(true)}
          className="absolute inset-0 z-10"
          aria-label={hasCurrentRound ? "Abrir ações da rodada atual" : "Abrir opções para criar uma nova rodada"}
          aria-expanded={showAdminActions}
          aria-haspopup="dialog"
          aria-controls="round-admin-actions"
        />
      ) : (
        <Link href={href} className="absolute inset-0 z-10" aria-label="Abrir agenda da pelada" />
      )}

      {/* Imagem de Fundo com Troféu e Estádio */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-[center_right_25%] sm:bg-center opacity-65 sm:opacity-55 transition-transform duration-700 ease-out group-hover:scale-105"
        style={{
          backgroundImage: "url('/images/championship-trophy-banner.jpg')",
        }}
      />

      {/* Gradientes e Iluminação Dinâmica para Contraste Boleiro Perfeito */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#030d07] via-[#04130b]/60 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#030e07] via-[#04140b]/70 to-transparent sm:via-[#04140b]/60" />
      <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl transition-transform duration-700 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-60 w-60 rounded-full bg-accent/20 blur-3xl" />

      {/* Conteúdo do Banner */}
      <div className="pointer-events-none absolute inset-5 z-20 flex flex-col gap-4 sm:inset-6">
        {/* Topo do Banner: Selo da Liga + Troféu Dourado */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 px-3.5 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)] backdrop-blur-md">
              <Football className="h-3.5 w-3.5 text-accent animate-pulse" />
              <span>Temporada Oficial · Pelada BQ</span>
            </span>
          </div>

          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/25 to-black/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.25)] backdrop-blur-md">
            <Trophy className="h-6 w-6" />
          </span>
        </div>

        {/* Informações Centrais: Título Boleiro e Convocados */}
        <div className={`w-full space-y-1.5 ${canOpenNewRound ? "mt-7 sm:mt-11" : "mt-3 sm:mt-7"}`}>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(204,255,0,0.8)]" />
            <p className="font-athletic text-xs font-black uppercase italic tracking-[0.25em] text-amber-300">
              {canOpenNewRound
                ? "Comece por aqui"
                : isPrelist
                ? "Pré-lista em Montagem"
                : round?.status === "active"
                ? "Bola Rolando ao Vivo"
                : "Próximo Confronto"}
            </p>
          </div>

          <h2 className="font-athletic text-[30px] xs:text-[34px] sm:text-5xl font-black uppercase italic leading-[1.05] sm:leading-none tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            {canOpenNewRound ? (
              <>
                Abra a <span className="inline-block pr-1.5 text-accent">próxima rodada</span>
              </>
            ) : round ? (
              <>
                Rodada{" "}
                <span className="inline-block pr-1.5 pb-0.5 bg-gradient-to-r from-accent via-emerald-300 to-amber-300 bg-clip-text text-transparent">
                  {String(round.number).padStart(2, "0")}
                </span>
              </>
            ) : (
              <>
                Agenda <span className="inline-block pr-1.5 text-accent">Oficial</span>
              </>
            )}
          </h2>

          {canOpenNewRound && (
            <div className="mt-7 flex items-center gap-3 rounded-2xl border border-accent/70 bg-accent px-4 py-3 text-[#07160d] shadow-[0_0_0_1px_rgba(255,255,255,.12),0_0_28px_rgba(204,255,0,.32)] transition-transform group-hover:scale-[1.015] sm:mt-9">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#07160d] text-accent shadow-[0_8px_20px_rgba(0,0,0,.24)]">
                <span className="absolute inset-0 animate-ping rounded-xl border border-accent/60 opacity-35" />
                <CalendarPlus className="relative h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block text-sm font-black uppercase">Toque para abrir</strong>
                <span className="mt-0.5 block text-[10px] font-bold leading-4 text-[#17351d]">Crie a convocação e chame os jogadores</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </div>
          )}

          {/* Chips Esportivos com Data, Horário e Local */}
          {!canOpenNewRound && <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
            {round && formattedDate && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-gray-200 backdrop-blur-md">
                <CalendarDays className="h-3.5 w-3.5 text-accent" />
                <span className="capitalize">{formattedDate}</span>
              </span>
            )}

            {round && formattedTime && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-gray-200 backdrop-blur-md">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>{formattedTime}</span>
              </span>
            )}

            {round && (
              confirmedCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/15 px-2.5 py-1 text-[11px] font-black text-accent backdrop-blur-md">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {confirmedCount} {confirmedCount === 1 ? "convocado" : "convocados"}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-300 backdrop-blur-md">
                  <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  <span>Aguardando abertura da lista</span>
                </span>
              )
            )}

            {venue?.name && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-gray-200 backdrop-blur-md">
                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                <span className="truncate max-w-[130px]">{venue.name}</span>
              </span>
            )}

            <WeatherBadge weather={weather} locationName={venue?.name} />
          </div>}
        </div>

        {/* Mantém o prêmio no fluxo do banner. Em telas estreitas os chips podem
            quebrar em mais de uma linha, então uma posição absoluta acabava
            cobrindo o último ícone/convocado. */}
        <div className="mt-auto pt-2">
          <BQTheBestButton periodStart={awardsPeriodStart} winners={awardWinners} />
        </div>
      </div>

    </article>

    {mounted && isAdmin && showAdminActions && typeof document !== "undefined" && createPortal(
      <div
        className="mobile-dialog-backdrop z-[99999] bg-black/80 backdrop-blur-md animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-admin-actions-title"
        onMouseDown={(event) => event.target === event.currentTarget && setShowAdminActions(false)}
      >
        <section
          id="round-admin-actions"
          className="mobile-dialog-panel relative my-auto flex max-w-sm flex-col justify-center rounded-3xl border border-accent/35 bg-[#07150d] p-6 shadow-[0_24px_80px_rgba(0,0,0,.9),0_0_35px_rgba(204,255,0,.08)] animate-fade-in-up"
        >
          <button
            type="button"
            onClick={() => setShowAdminActions(false)}
            className="absolute right-4 top-4 rounded-full border border-border bg-surface p-2.5 text-muted transition-colors hover:text-foreground"
            aria-label="Fechar ações"
          >
            <X className="size-4" />
          </button>
          <p className="pr-12 text-[10px] font-black uppercase tracking-[0.12em] text-accent">Área do ADM</p>
          <h3 id="round-admin-actions-title" className="mt-1 pr-12 text-balance font-athletic text-2xl font-black uppercase text-white">
            O que você quer fazer?
          </h3>
          <p className="mt-2 text-pretty text-xs leading-5 text-muted">
            {hasCurrentRound
              ? "Acesse a rodada em andamento ou consulte tudo o que já aconteceu."
              : "Abra a lista do próximo jogo ou consulte tudo o que já aconteceu."}
          </p>
          <div className="mt-5 grid gap-2.5">
            <Link
              href={round ? `/rodadas/${round.id}` : "/rodadas?create=1"}
              onClick={() => setShowAdminActions(false)}
              className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-background transition-transform active:scale-[.98]"
            >
              {hasCurrentRound ? <CalendarDays className="size-5" /> : <CalendarPlus className="size-5" />}
              {hasCurrentRound ? "Ver rodada atual" : "Abrir nova rodada"}
            </Link>
            <Link
              href="/rodadas#historico"
              onClick={() => setShowAdminActions(false)}
              className="flex min-h-13 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-foreground transition-colors hover:border-accent/30"
            >
              <CalendarDays className="size-5" /> Ver histórico de rodadas
            </Link>
          </div>
        </section>
      </div>,
      document.body,
    )}
    </>
  );
}
