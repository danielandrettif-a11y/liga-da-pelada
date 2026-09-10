"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Crown, Football, Medal, Shield, Target, Trophy, X } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useDialogViewport } from "@/lib/useDialogViewport";
import {
  formatAwardMonth,
  formatAwardPerformance,
  MONTHLY_AWARD_LABELS,
  type MonthlyAwardType,
  type MonthlyAwardWinner,
} from "@/lib/monthly-awards";

const AWARD_ORDER: MonthlyAwardType[] = [
  "bestDefenderMonth",
  "bestMidfielderMonth",
  "bestAttackerMonth",
  "bestGoalkeeperMonth",
  "goldenBootMonth",
  "topAssistMonth",
  "bestManagerMonth",
];

export function BQTheBestButton({ periodStart, winners }: { periodStart: string; winners: MonthlyAwardWinner[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useDialogViewport(open);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const monthLabel = formatAwardMonth(periodStart).replace(/ de \d{4}$/, "");
  const orderedWinners = AWARD_ORDER.map((type) => winners.find((winner) => winner.type === type));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto relative z-30 flex w-full items-center gap-3 rounded-2xl border border-amber-300/45 bg-gradient-to-r from-[#291b05]/95 via-[#183216]/95 to-[#07160d]/95 px-3.5 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-md transition-transform active:scale-[.98]"
        aria-haspopup="dialog"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/15 text-amber-300 shadow-[0_0_18px_rgba(251,191,36,.18)]">
          <Crown className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-athletic text-[13px] font-black uppercase italic tracking-[0.12em] text-amber-200">BQ The Best</span>
          <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-white/75">Melhores de {monthLabel}</span>
        </span>
        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-accent">Ver <ChevronRight className="h-3.5 w-3.5" /></span>
      </button>

      {mounted && open && typeof document !== "undefined" && createPortal(
        <div
          className="mobile-dialog-backdrop z-[99999] items-end bg-black/90 p-0 backdrop-blur-md sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bq-the-best-title"
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <section className="mobile-dialog-panel mobile-dialog-scroll relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-amber-300/35 bg-[#06120b] p-5 shadow-[0_-16px_60px_rgba(0,0,0,.7)] sm:rounded-[2rem]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-amber-300/15 to-transparent" />
            <header className="relative flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 text-[#251500] shadow-[0_0_28px_rgba(251,191,36,.25)]"><Trophy className="h-7 w-7" /></span>
                <div>
                  <p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.24em] text-amber-300">Pelada BQ apresenta</p>
                  <h2 id="bq-the-best-title" className="font-athletic text-2xl font-black uppercase italic text-white">BQ The Best</h2>
                  <p className="text-xs font-semibold text-white/55">Melhores de {formatAwardMonth(periodStart)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white" aria-label="Fechar premiações"><X className="h-4 w-4" /></button>
            </header>

            <div className="relative mt-4 grid gap-2.5">
              {orderedWinners.map((winner, index) => {
                const type = AWARD_ORDER[index];
                const Icon = type === "bestManagerMonth"
                  ? Trophy
                  : type === "bestGoalkeeperMonth"
                    ? Shield
                    : type === "goldenBootMonth"
                      ? Football
                      : type === "topAssistMonth"
                        ? Target
                        : Medal;
                return (
                  <article key={type} className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[.07] to-transparent p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300/15 text-amber-300"><Icon className="h-4 w-4" /></span>
                    {winner ? (
                      <>
                        <PlayerAvatar name={winner.playerName} avatarUrl={winner.avatarUrl} clickable={false} className="h-11 w-11 rounded-full border-2 border-amber-300/60 bg-surface" sizes="44px" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">{MONTHLY_AWARD_LABELS[type]}</p>
                          <p className="truncate text-sm font-black text-white">{winner.playerName}</p>
                          <p className="text-[9px] text-white/50">{formatAwardPerformance(winner)} · {winner.roundsPlayed} rodada{winner.roundsPlayed === 1 ? "" : "s"}</p>
                        </div>
                      </>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">{MONTHLY_AWARD_LABELS[type]}</p>
                        <p className="text-xs font-bold text-white/45">Sem resultado consolidado</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
