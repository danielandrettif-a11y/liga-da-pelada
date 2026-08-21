"use client";

import { useState } from "react";
import { CheckCircle2, Crown, Sparkles, Users } from "@/components/icons";

type Stage = { id: string; label: string; shortLabel: string; start: number; end: number; x?: number; y?: number };

const MILESTONES = [1, 5, 10, 18, 25, 32, 40];
const STANDS: Stage[] = Array.from({ length: 12 }, (_, index) => {
  const house = index + 1;
  return { id: "stands-" + house, label: "Arquibancada", shortLabel: "TOR", start: house, end: house };
});
const BENCH: Stage[] = Array.from({ length: 12 }, (_, index) => {
  const house = index + 13;
  return { id: "bench-" + house, label: "Banco de reservas", shortLabel: "BAN", start: house, end: house };
});

// 4-3-3 com apenas 11 posições dentro do gramado; a casa 40 termina no centroavante.
const FIELD_STAGES: Stage[] = [
  { id: "goalkeeper", label: "Goleiro", shortLabel: "GOL", start: 25, end: 25, x: 50, y: 85 },
  { id: "right-back", label: "Lateral direito", shortLabel: "LD", start: 26, end: 26, x: 83, y: 70 },
  { id: "right-center-back", label: "Zagueiro direito", shortLabel: "ZAG", start: 27, end: 27, x: 61, y: 73 },
  { id: "left-center-back", label: "Zagueiro esquerdo", shortLabel: "ZAG", start: 28, end: 28, x: 39, y: 73 },
  { id: "left-back", label: "Lateral esquerdo", shortLabel: "LE", start: 29, end: 29, x: 17, y: 70 },
  { id: "defensive-midfielder", label: "Volante", shortLabel: "VOL", start: 30, end: 30, x: 50, y: 58 },
  { id: "right-midfielder", label: "Meia direito", shortLabel: "MEI", start: 31, end: 31, x: 72, y: 49 },
  { id: "left-midfielder", label: "Meia esquerdo", shortLabel: "MEI", start: 32, end: 32, x: 28, y: 49 },
  { id: "right-winger", label: "Ponta direita", shortLabel: "PD", start: 33, end: 34, x: 77, y: 30 },
  { id: "left-winger", label: "Ponta esquerda", shortLabel: "PE", start: 35, end: 36, x: 23, y: 30 },
  { id: "striker", label: "Centroavante", shortLabel: "CA", start: 37, end: 40, x: 50, y: 17 },
];
const ALL_STAGES = [...STANDS, ...BENCH, ...FIELD_STAGES];

function currentStageFor(progress: number) {
  return ALL_STAGES.find((stage) => progress >= stage.start && progress <= stage.end) || (progress < 1 ? STANDS[0] : FIELD_STAGES.at(-1)!);
}
function rangeLabel(stage: Stage) { return stage.start === stage.end ? "Casa " + stage.start : "Casas " + stage.start + "–" + stage.end; }
function milestonesFor(stage: Stage) { return MILESTONES.filter((milestone) => milestone >= stage.start && milestone <= stage.end); }

export function SeasonPassPitch({ progress, playerName, playerAvatarUrl }: { progress: number; playerName: string | null; playerAvatarUrl: string | null }) {
  const currentStage = currentStageFor(progress);
  const [selectedId, setSelectedId] = useState(currentStage.id);
  const [imageFailed, setImageFailed] = useState(false);
  const selected = ALL_STAGES.find((stage) => stage.id === selectedId) || currentStage;
  const selectedMilestones = milestonesFor(selected);

  function isCurrent(stage: Stage) { return stage.id === currentStage.id; }
  function isComplete(stage: Stage) { return progress >= stage.end; }
  function stageClass(stage: Stage) {
    if (isCurrent(stage)) return "border-accent bg-accent/20 text-white ring-2 ring-accent/20";
    if (isComplete(stage)) return "border-[#bd82ff]/60 bg-[#281342] text-[#e2ccff]";
    return "border-white/10 bg-black/20 text-white/45";
  }
  function avatar(stage: Stage, compact = false) {
    if (isCurrent(stage) && playerAvatarUrl && !imageFailed) return <img src={playerAvatarUrl} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />;
    if (isCurrent(stage)) return <img src="/icons/pelada-bq-v2-192.png" alt="" className={compact ? "h-4 w-4 object-contain" : "h-7 w-7 object-contain"} />;
    if (isComplete(stage)) return <CheckCircle2 className={compact ? "h-3.5 w-3.5 text-[#d7adff]" : "h-5 w-5 text-[#d7adff]"} />;
    return null;
  }

  function seat(stage: Stage, kind: "stands" | "bench") {
    const landmark = milestonesFor(stage).length > 0;
    return <button key={stage.id} type="button" onClick={() => setSelectedId(stage.id)} aria-label={stage.label + ", casa " + stage.start} className={"relative flex aspect-square items-center justify-center rounded-md border text-[8px] font-black transition-transform active:scale-95 " + stageClass(stage)}><span className="absolute left-1 top-0.5 text-[6px] text-white/45">{stage.start}</span>{avatar(stage, true)}{!isCurrent(stage) && !isComplete(stage) && (kind === "bench" ? "🪑" : "●")}{landmark && <Sparkles className="absolute -right-0.5 -top-1 h-3 w-3 text-warning" />}</button>;
  }

  function marker(stage: Stage) {
    const future = progress < stage.start;
    const landmark = milestonesFor(stage).length > 0;
    const label = stage.start === stage.end ? String(stage.start) : stage.start + "–" + stage.end;
    return <button key={stage.id} type="button" onClick={() => setSelectedId(stage.id)} aria-pressed={selected.id === stage.id} className={"group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform active:scale-95 " + (future ? "opacity-45" : "opacity-100")} style={{ left: stage.x + "%", top: stage.y + "%" }}><span className={"relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 text-[8px] font-black shadow-lg " + (isCurrent(stage) ? "border-accent bg-accent/20 ring-4 ring-accent/20" : isComplete(stage) ? "border-[#bd82ff] bg-[#281342]" : "border-white/20 bg-[#07170e]")}>{avatar(stage)}{!isCurrent(stage) && !isComplete(stage) && stage.shortLabel}{landmark && <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-warning drop-shadow" />}</span><span className={"mt-1 max-w-16 rounded-md px-1 py-0.5 text-center text-[7px] font-black uppercase leading-tight " + (isCurrent(stage) ? "bg-accent text-background" : "bg-black/75 text-white/80")}>{stage.shortLabel} {label}</span></button>;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-accent/30 bg-[#06170d] p-3 shadow-[0_0_35px_rgba(52,211,153,.10)]">
      <div className="flex items-start justify-between gap-3 px-1 pb-3"><div><p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-accent">Sua jornada no estádio</p><h2 className="mt-1 text-lg font-black text-white">{progress === 0 ? "A torcida espera por você" : (playerName || "Jogador") + " · " + currentStage.label}</h2></div><span className="shrink-0 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-center"><span className="block font-athletic text-xl font-black text-accent">{progress}</span><span className="block text-[7px] font-black uppercase tracking-wider text-accent/75">de 40</span></span></div>

      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/15 bg-[#041009] p-2">
        <div className="relative rounded-t-[1rem] border border-white/10 bg-[linear-gradient(180deg,#1d2f29,#0b1712)] p-2 shadow-inner"><div className="mb-1 flex items-center justify-between px-1"><span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-[.16em] text-white/70"><Users className="h-3.5 w-3.5 text-accent" /> Arquibancada</span><span className="text-[7px] font-black text-muted">Casas 1–12</span></div><div className="grid grid-cols-6 gap-1">{STANDS.map((stage) => seat(stage, "stands"))}</div></div>

        <div className="relative mt-2">
          <aside className="absolute inset-y-0 left-0 z-20 flex w-[23%] flex-col rounded-l-xl border border-white/15 bg-[#121f18] p-1.5 shadow-xl"><div className="mb-1 text-center text-[7px] font-black uppercase tracking-[.1em] text-white/65">Banco</div><div className="grid flex-1 grid-cols-2 content-between gap-1">{BENCH.map((stage) => seat(stage, "bench"))}</div><span className="mt-1 text-center text-[6px] font-black text-muted">13–24</span></aside>
          <div className="relative ml-[26%] aspect-[3/4] overflow-hidden rounded-r-xl border-2 border-white/20 bg-[#0a6539] shadow-inner">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.035)_0,rgba(255,255,255,.035)_12.5%,transparent_12.5%,transparent_25%)]" />
            <div className="absolute inset-2 border border-white/45" /><div className="absolute left-2 right-2 top-1/2 h-px bg-white/45" /><div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/45" />
            <div className="absolute left-1/2 top-2 h-10 w-[37%] -translate-x-1/2 border border-t-0 border-white/45" /><div className="absolute bottom-2 left-1/2 h-10 w-[37%] -translate-x-1/2 border border-b-0 border-white/45" />
            <div className="absolute left-1/2 top-2 h-3 w-[18%] -translate-x-1/2 border border-t-0 border-white/45" /><div className="absolute bottom-2 left-1/2 h-3 w-[18%] -translate-x-1/2 border border-b-0 border-white/45" />
            {FIELD_STAGES.map(marker)}
            <span className="absolute left-1/2 top-0.5 -translate-x-1/2 rounded-b-lg bg-black/45 px-2 py-0.5 text-[6px] font-black uppercase tracking-[.12em] text-white/70">Ataque</span><span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-t-lg bg-black/45 px-2 py-0.5 text-[6px] font-black uppercase tracking-[.12em] text-white/70">Defesa</span>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-[#bd82ff]/30 bg-[#241136]/55 p-3"><div className="flex items-start gap-3"><Crown className="mt-0.5 h-5 w-5 shrink-0 text-[#d7adff]" /><div><p className="text-xs font-black text-white">{selected.label} · {rangeLabel(selected)}</p><p className="mt-1 text-[11px] leading-5 text-white/65">{progress >= selected.end ? "Etapa concluída. Você já garantiu este espaço na sua jornada." : progress >= selected.start ? "Você está nesta posição: continue jogando para avançar." : "Posição bloqueada. Continue participando para chegar até aqui."}</p>{selectedMilestones.length > 0 && <p className="mt-2 text-[10px] font-bold text-[#d7adff]">{selectedMilestones.map((milestone) => "Marco da casa " + milestone).join(" · ")} · recompensa cosmética em breve</p>}</div></div></div>
    </section>
  );
}
