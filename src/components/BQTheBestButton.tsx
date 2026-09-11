"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Crown, Football, Medal, Share2, Shield, Target, Trophy, X } from "@/components/icons";
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
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
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

  async function handleShareAwards() {
    setSharing(true);
    setShareMessage("");
    try {
      const { createMonthlyAwardsStory } = await import("@/lib/monthly-awards-story");
      const blob = await createMonthlyAwardsStory(periodStart, awardEntries);
      const file = new File([blob], `bq-the-best-${periodStart}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "BQ The Best",
          text: `Confira os melhores de ${formatAwardMonth(periodStart)}!`,
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        setShareMessage("Imagem baixada para postar!");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Erro ao gerar imagem das premiações:", error);
        setShareMessage("Não foi possível gerar a imagem. Tente novamente.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedWinner(null);
          setOpen(true);
        }}
        className="pointer-events-auto relative z-30 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-fuchsia-300/75 bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,.42),transparent_34%),linear-gradient(110deg,#64134f_0%,#9d1d62_46%,#351027_100%)] px-3.5 py-3 text-left shadow-[0_0_0_1px_rgba(250,204,21,.22),0_14px_32px_rgba(112,18,83,.55),inset_0_1px_0_rgba(255,255,255,.2)] transition-transform active:scale-[.98]"
        aria-haspopup="dialog"
      >
        <span aria-hidden="true" className="absolute -right-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-fuchsia-200/20 blur-2xl" />
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-100/70 bg-gradient-to-br from-yellow-200 to-amber-500 text-[#381124] shadow-[0_0_22px_rgba(250,204,21,.55)]">
          <Crown className="h-5 w-5" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-athletic text-[13px] font-black uppercase italic tracking-[0.12em] text-yellow-100">BQ The Best</span>
          <span className="block truncate text-[10px] font-black uppercase tracking-wider text-white/90">Melhores de {monthLabel}</span>
        </span>
        <span className="relative flex items-center gap-1 rounded-full bg-yellow-200 px-2.5 py-1 text-[9px] font-black uppercase text-[#4b1535] shadow-[0_0_18px_rgba(250,204,21,.36)]">Ver <ChevronRight className="h-3.5 w-3.5" /></span>
      </button>

      {mounted && open && typeof document !== "undefined" && createPortal(
        <div
          className="mobile-dialog-backdrop z-[99999] items-end bg-black/90 p-0 backdrop-blur-md sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bq-the-best-title"
          onMouseDown={(event) => event.target === event.currentTarget && closeModal()}
        >
          <section className="mobile-dialog-panel relative flex max-h-[calc(100dvh-0.75rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] border border-amber-300/35 bg-[#06120b] shadow-[0_-16px_60px_rgba(0,0,0,.7)] sm:max-h-[90dvh] sm:rounded-[2rem]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-amber-300/15 to-transparent" />
            <header className="relative flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
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

            <div className="mobile-dialog-scroll relative flex-1 overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-5">
              {selectedWinner ? (
              <div className="relative animate-fade-in">
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
              <div className="relative">
                <div className="mb-3 flex items-end justify-between gap-3 px-1">
                  <div>
                    <p className="font-athletic text-xs font-black uppercase italic tracking-[0.15em] text-white">Seleção do mês</p>
                    <p className="mt-0.5 text-[10px] text-white/45">Toque em um vencedor para ver a conquista</p>
                  </div>
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[8px] font-black uppercase text-amber-200">8 categorias</span>
                </div>

                <button type="button" onClick={handleShareAwards} disabled={sharing} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-300/45 bg-fuchsia-300/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-100 transition-colors hover:bg-fuchsia-300/20 disabled:opacity-60">
                  <Share2 className="h-4 w-4" /> {sharing ? "Gerando imagem..." : "Gerar imagem para postar"}
                </button>
                {shareMessage && <p className="mb-3 text-center text-[10px] font-bold text-accent">{shareMessage}</p>}

                <div className="grid gap-2.5">
                  {awardEntries.map(({ winner, type }) => {
                    const visual = AWARD_VISUALS[type];
                    return winner ? (
                      <button
                        key={`${type}-${winner.playerId}`}
                        type="button"
                        onClick={() => setSelectedWinner(winner)}
                        className={`group flex min-h-[74px] w-full items-center gap-2.5 rounded-xl border p-2.5 text-left shadow-[0_10px_24px_rgba(0,0,0,.18)] transition-transform active:scale-[.98] sm:min-h-[82px] sm:gap-3 sm:rounded-2xl sm:p-3 ${visual.card}`}
                        aria-label={`Ver conquista de ${winner.playerName}: ${MONTHLY_AWARD_LABELS[type]}`}
                      >
                        <span className={`relative flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border sm:h-12 sm:w-12 sm:rounded-2xl ${visual.icon}`}>
                          <AwardIcon type={type} className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          <span className="mt-0.5 text-[7px] font-black tracking-wider">{visual.code}</span>
                        </span>
                        <PlayerAvatar name={winner.playerName} avatarUrl={winner.avatarUrl} clickable={false} className="h-11 w-11 rounded-full border-2 border-amber-200/75 bg-surface shadow-[0_0_18px_rgba(251,191,36,.16)] sm:h-[52px] sm:w-[52px]" sizes="52px" />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[8px] font-black uppercase tracking-[0.1em] sm:text-[9px] sm:tracking-[0.12em] ${visual.eyebrow}`}>{MONTHLY_AWARD_LABELS[type]}</span>
                          <span className="mt-0.5 block truncate text-[15px] font-black text-white sm:text-base">{winner.playerName}</span>
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
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
