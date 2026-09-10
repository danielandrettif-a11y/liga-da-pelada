"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Crown, Football, Medal, Shield, Target, Trophy, X } from "@/components/icons";
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
  "bestWagMonth",
];

const AWARD_VISUALS: Record<MonthlyAwardType, { code: string; card: string; icon: string; eyebrow: string }> = {
  bestDefenderMonth: {
    code: "DEF",
    card: "border-sky-300/30 bg-gradient-to-r from-sky-400/15 via-[#0a1d1b] to-[#07130c]",
    icon: "border-sky-300/35 bg-sky-400/15 text-sky-300",
    eyebrow: "text-sky-300",
  },
  bestMidfielderMonth: {
    code: "ALA/MEI",
    card: "border-violet-300/30 bg-gradient-to-r from-violet-400/15 via-[#151522] to-[#07130c]",
    icon: "border-violet-300/35 bg-violet-400/15 text-violet-300",
    eyebrow: "text-violet-300",
  },
  bestAttackerMonth: {
    code: "ATA",
    card: "border-rose-300/30 bg-gradient-to-r from-rose-400/15 via-[#211315] to-[#07130c]",
    icon: "border-rose-300/35 bg-rose-400/15 text-rose-300",
    eyebrow: "text-rose-300",
  },
  bestGoalkeeperMonth: {
    code: "GOL",
    card: "border-cyan-300/30 bg-gradient-to-r from-cyan-400/15 via-[#0a1c20] to-[#07130c]",
    icon: "border-cyan-300/35 bg-cyan-400/15 text-cyan-300",
    eyebrow: "text-cyan-300",
  },
  goldenBootMonth: {
    code: "GOLS",
    card: "border-amber-300/35 bg-gradient-to-r from-amber-400/20 via-[#241b0a] to-[#07130c]",
    icon: "border-amber-300/40 bg-amber-400/20 text-amber-200",
    eyebrow: "text-amber-200",
  },
  topAssistMonth: {
    code: "ASSIST",
    card: "border-emerald-300/30 bg-gradient-to-r from-emerald-400/15 via-[#0b2017] to-[#07130c]",
    icon: "border-emerald-300/35 bg-emerald-400/15 text-emerald-300",
    eyebrow: "text-emerald-300",
  },
  bestManagerMonth: {
    code: "TÉC",
    card: "border-accent/35 bg-gradient-to-r from-accent/15 via-[#19230a] to-[#07130c]",
    icon: "border-accent/40 bg-accent/15 text-accent",
    eyebrow: "text-accent",
  },
  bestWagMonth: {
    code: "WAG",
    card: "border-fuchsia-300/30 bg-gradient-to-r from-fuchsia-400/15 via-[#241326] to-[#07130c]",
    icon: "border-fuchsia-300/35 bg-fuchsia-400/15 text-fuchsia-200",
    eyebrow: "text-fuchsia-200",
  },
};

const AWARD_EXPLANATIONS: Record<MonthlyAwardType, string> = {
  bestDefenderMonth: "Teve a maior soma de pontos nas rodadas em que atuou com a tag Defensor.",
  bestMidfielderMonth: "Teve a maior soma de pontos nas rodadas em que atuou com a tag Ala/Meio.",
  bestAttackerMonth: "Teve a maior soma de pontos nas rodadas em que atuou com a tag Atacante.",
  bestGoalkeeperMonth: "Foi quem menos sofreu gols durante as partidas em que atuou no gol.",
  goldenBootMonth: "Foi o jogador que marcou mais gols nas rodadas oficiais do mês.",
  topAssistMonth: "Foi o jogador que distribuiu mais assistências nas rodadas oficiais do mês.",
  bestManagerMonth: "Conquistou a maior pontuação acumulada no Cartola durante o mês.",
  bestWagMonth: "Prêmio honorário mensal concedido à Anna e à Duda, sem critério competitivo.",
};

type AwardEntry = {
  type: MonthlyAwardType;
  winner?: MonthlyAwardWinner;
};

function AwardIcon({ type, className }: { type: MonthlyAwardType; className?: string }) {
  const Icon = type === "bestManagerMonth"
    ? Trophy
    : type === "bestWagMonth"
      ? Crown
    : type === "bestGoalkeeperMonth"
      ? Shield
      : type === "goldenBootMonth"
        ? Football
        : type === "topAssistMonth"
          ? Target
          : Medal;
  return <Icon className={className} />;
}

export function BQTheBestButton({ periodStart, winners }: { periodStart: string; winners: MonthlyAwardWinner[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<MonthlyAwardWinner | null>(null);
  useDialogViewport(open);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedWinner) setSelectedWinner(null);
      else setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, selectedWinner]);

  function closeModal() {
    setSelectedWinner(null);
    setOpen(false);
  }

  const monthLabel = formatAwardMonth(periodStart).replace(/ de \d{4}$/, "");
  const awardEntries = AWARD_ORDER.flatMap((type): AwardEntry[] => {
    const categoryWinners = winners.filter((winner) => winner.type === type);
    return categoryWinners.length > 0
      ? categoryWinners.map((winner) => ({ type, winner }))
      : [{ type, winner: undefined }];
  });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedWinner(null);
          setOpen(true);
        }}
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
          onMouseDown={(event) => event.target === event.currentTarget && closeModal()}
        >
          <section className="mobile-dialog-panel mobile-dialog-scroll relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-amber-300/35 bg-[#06120b] p-5 shadow-[0_-16px_60px_rgba(0,0,0,.7)] sm:rounded-[2rem]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-amber-300/15 to-transparent" />
            <header className="relative flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 text-[#251500] shadow-[0_0_28px_rgba(251,191,36,.25)]"><Trophy className="h-7 w-7" /></span>
                <div>
                  <p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.24em] text-amber-300">Pelada BQ apresenta</p>
                  <h2 id="bq-the-best-title" className="font-athletic text-2xl font-black uppercase italic text-white">BQ The Best</h2>
                  <p className="text-xs font-semibold text-white/55">{selectedWinner ? MONTHLY_AWARD_LABELS[selectedWinner.type] : `Melhores de ${formatAwardMonth(periodStart)}`}</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white" aria-label="Fechar premiações"><X className="h-4 w-4" /></button>
            </header>

            {selectedWinner ? (
              <div className="relative mt-5 animate-fade-in">
                <button type="button" onClick={() => setSelectedWinner(null)} className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/60 transition-colors hover:text-white">
                  <ArrowLeft className="h-4 w-4" /> Voltar aos vencedores
                </button>

                <div className={`relative overflow-hidden rounded-[1.75rem] border p-5 ${AWARD_VISUALS[selectedWinner.type].card}`}>
                  <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
                  <div className="relative flex flex-col items-center text-center">
                    <span className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${AWARD_VISUALS[selectedWinner.type].icon}`}>
                      <AwardIcon type={selectedWinner.type} className="h-3.5 w-3.5" /> Conquista do mês
                    </span>
                    <PlayerAvatar name={selectedWinner.playerName} avatarUrl={selectedWinner.avatarUrl} clickable={false} className="h-24 w-24 rounded-full border-[3px] border-amber-200/80 bg-surface shadow-[0_0_34px_rgba(251,191,36,.24)]" sizes="96px" />
                    <p className={`mt-4 font-athletic text-xs font-black uppercase italic tracking-[0.14em] ${AWARD_VISUALS[selectedWinner.type].eyebrow}`}>{MONTHLY_AWARD_LABELS[selectedWinner.type]}</p>
                    <h3 className="mt-1 text-2xl font-black text-white">{selectedWinner.playerName}</h3>

                    <div className="mt-5 w-full rounded-2xl border border-white/10 bg-black/25 p-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">O que fez para ganhar</p>
                      <p className="mt-2 font-athletic text-3xl font-black italic text-amber-200">{formatAwardPerformance(selectedWinner)}</p>
                      {selectedWinner.type !== "bestWagMonth" && <p className="mt-1 text-[11px] font-semibold text-white/55">em {selectedWinner.roundsPlayed} rodada{selectedWinner.roundsPlayed === 1 ? "" : "s"} oficial{selectedWinner.roundsPlayed === 1 ? "" : "is"}</p>}
                    </div>

                    <div className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[.04] p-4 text-left">
                      <p className="text-xs font-bold leading-5 text-white/80">{AWARD_EXPLANATIONS[selectedWinner.type]}</p>
                      {selectedWinner.type !== "bestWagMonth" && <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-4 text-white/45">Em caso de empate: mais vitórias, depois mais empates.</p>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative mt-4">
                <div className="mb-3 flex items-end justify-between gap-3 px-1">
                  <div>
                    <p className="font-athletic text-xs font-black uppercase italic tracking-[0.15em] text-white">Seleção do mês</p>
                    <p className="mt-0.5 text-[10px] text-white/45">Toque em um vencedor para ver a conquista</p>
                  </div>
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[8px] font-black uppercase text-amber-200">8 categorias</span>
                </div>

                <div className="grid gap-2.5">
                  {awardEntries.map(({ winner, type }) => {
                    const visual = AWARD_VISUALS[type];
                    return winner ? (
                      <button
                        key={`${type}-${winner.playerId}`}
                        type="button"
                        onClick={() => setSelectedWinner(winner)}
                        className={`group flex min-h-[82px] w-full items-center gap-3 rounded-2xl border p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,.18)] transition-transform active:scale-[.98] ${visual.card}`}
                        aria-label={`Ver conquista de ${winner.playerName}: ${MONTHLY_AWARD_LABELS[type]}`}
                      >
                        <span className={`relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border ${visual.icon}`}>
                          <AwardIcon type={type} className="h-5 w-5" />
                          <span className="mt-0.5 text-[7px] font-black tracking-wider">{visual.code}</span>
                        </span>
                        <PlayerAvatar name={winner.playerName} avatarUrl={winner.avatarUrl} clickable={false} className="h-[52px] w-[52px] rounded-full border-2 border-amber-200/75 bg-surface shadow-[0_0_18px_rgba(251,191,36,.16)]" sizes="52px" />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[9px] font-black uppercase tracking-[0.12em] ${visual.eyebrow}`}>{MONTHLY_AWARD_LABELS[type]}</span>
                          <span className="mt-0.5 block truncate text-base font-black text-white">{winner.playerName}</span>
                          <span className="mt-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-white/45">Ver conquista <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
                        </span>
                      </button>
                    ) : (
                      <article key={type} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3 opacity-60">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${visual.icon}`}><AwardIcon type={type} className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[9px] font-black uppercase tracking-wider ${visual.eyebrow}`}>{MONTHLY_AWARD_LABELS[type]}</p>
                          <p className="mt-1 text-xs font-bold text-white/45">Sem resultado consolidado</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
