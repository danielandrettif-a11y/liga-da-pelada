"use client";

import { useState } from "react";
import { CheckCircle2, Crown, Sparkles, Users } from "@/components/icons";

type Stage = {
  id: string;
  label: string;
  shortLabel: string;
  start: number;
  end: number;
  x?: number;
  y?: number;
  field?: boolean;
};

const MILESTONES = [1, 5, 10, 18, 25, 32, 40];

const OFF_FIELD_STAGES: Stage[] = [
  { id: "supporters", label: "Torcida", shortLabel: "TOR", start: 1, end: 1 },
  { id: "bench", label: "Banco", shortLabel: "BAN", start: 2, end: 4 },
];

// 4-3-3: somente 11 posições reais dentro do gramado.
const FIELD_STAGES: Stage[] = [
  { id: "goalkeeper", label: "Goleiro", shortLabel: "GOL", start: 5, end: 7, x: 50, y: 85, field: true },
  { id: "right-back", label: "Lateral direito", shortLabel: "LD", start: 8, end: 10, x: 82, y: 70, field: true },
  { id: "right-center-back", label: "Zagueiro direito", shortLabel: "ZAG", start: 11, end: 13, x: 61, y: 73, field: true },
  { id: "left-center-back", label: "Zagueiro esquerdo", shortLabel: "ZAG", start: 14, end: 16, x: 39, y: 73, field: true },
  { id: "left-back", label: "Lateral esquerdo", shortLabel: "LE", start: 17, end: 19, x: 18, y: 70, field: true },
  { id: "defensive-midfielder", label: "Volante", shortLabel: "VOL", start: 20, end: 22, x: 50, y: 58, field: true },
  { id: "right-midfielder", label: "Meia direito", shortLabel: "MEI", start: 23, end: 25, x: 72, y: 49, field: true },
  { id: "left-midfielder", label: "Meia esquerdo", shortLabel: "MEI", start: 26, end: 28, x: 28, y: 49, field: true },
  { id: "right-winger", label: "Ponta direita", shortLabel: "PD", start: 29, end: 32, x: 77, y: 30, field: true },
  { id: "left-winger", label: "Ponta esquerda", shortLabel: "PE", start: 33, end: 36, x: 23, y: 30, field: true },
  { id: "striker", label: "Centroavante", shortLabel: "CA", start: 37, end: 40, x: 50, y: 17, field: true },
];

function rangeLabel(stage: Stage) {
  return stage.start === stage.end ? `Casa ${stage.start}` : `Casas ${stage.start}–${stage.end}`;
}

function stageForProgress(progress: number) {
  const stages = [...OFF_FIELD_STAGES, ...FIELD_STAGES];
  return stages.find((stage) => progress >= stage.start && progress <= stage.end) || (progress < 1 ? OFF_FIELD_STAGES[0] : FIELD_STAGES.at(-1)!);
}

export function SeasonPassPitch({ progress, playerName, playerAvatarUrl }: { progress: number; playerName: string | null; playerAvatarUrl: string | null }) {
  const [selectedId, setSelectedId] = useState(() => stageForProgress(progress).id);
  const [imageFailed, setImageFailed] = useState(false);
  const currentStage = stageForProgress(progress);
  const selected = [...OFF_FIELD_STAGES, ...FIELD_STAGES].find((stage) => stage.id === selectedId) || currentStage;
  const selectedMilestones = MILESTONES.filter((milestone) => milestone >= selected.start && milestone <= selected.end);

  const renderPlayer = (stage: Stage) => {
    const isCurrent = stage.id === currentStage.id;
    const completed = progress >= stage.end;
    const future = progress < stage.start;
    const stageMilestones = MILESTONES.filter((milestone) => milestone >= stage.start && milestone <= stage.end);

    return (
      <button
        key={stage.id}
        type="button"
        onClick={() => setSelectedId(stage.id)}
        aria-pressed={selected.id === stage.id}
        className={`group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform active:scale-95 ${future ? "opacity-45" : "opacity-100"}`}
        style={{ left: `${stage.x}%`, top: `${stage.y}%` }}
      >
        <span className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 text-[9px] font-black shadow-lg ${isCurrent ? "border-accent bg-accent/20 ring-4 ring-accent/20" : completed ? "border-[#bd82ff] bg-[#281342]" : "border-white/20 bg-[#07170e]"}`}>
          {isCurrent && playerAvatarUrl && !imageFailed ? <img src={playerAvatarUrl} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} /> : isCurrent ? <img src="/icons/pelada-bq-v2-192.png" alt="" className="h-7 w-7 object-contain" /> : completed ? <CheckCircle2 className="h-5 w-5 text-[#d7adff]" /> : stage.shortLabel}
          {stageMilestones.length > 0 && <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-warning drop-shadow" />}
        </span>
        <span className={`mt-1 max-w-16 rounded-md px-1 py-0.5 text-center text-[7px] font-black uppercase leading-tight ${isCurrent ? "bg-accent text-background" : "bg-black/75 text-white/80"}`}>{stage.shortLabel} {stage.start}–{stage.end}</span>
      </button>
    );
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-accent/30 bg-[#06170d] p-3 shadow-[0_0_35px_rgba(52,211,153,.10)]">
      <div className="flex items-start justify-between gap-3 px-1 pb-3">
        <div><p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-accent">Sua jornada em campo</p><h2 className="mt-1 text-lg font-black text-white">{progress === 0 ? "A torcida espera por você" : `${playerName || "Jogador"} · ${currentStage.label}`}</h2></div>
        <span className="shrink-0 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-center"><span className="block font-athletic text-xl font-black text-accent">{progress}</span><span className="block text-[7px] font-black uppercase tracking-wider text-accent/75">de 40</span></span>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-3">
        {OFF_FIELD_STAGES.map((stage) => {
          const current = stage.id === currentStage.id;
          const completed = progress >= stage.end;
          return <button key={stage.id} type="button" onClick={() => setSelectedId(stage.id)} className={`flex min-h-15 items-center gap-2 rounded-2xl border p-2.5 text-left transition-transform active:scale-[.98] ${current ? "border-accent bg-accent/15" : completed ? "border-[#bd82ff]/50 bg-[#281342]/45" : "border-white/10 bg-black/20 opacity-65"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/25 text-accent">{stage.id === "supporters" ? <Users className="h-5 w-5" /> : <span className="text-lg">🪑</span>}</span><span><span className="block text-[10px] font-black uppercase text-white">{stage.label}</span><span className="mt-0.5 block text-[8px] font-bold text-muted">{rangeLabel(stage)}</span></span></button>;
        })}
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border-2 border-white/20 bg-[#0a6539] shadow-inner">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.035)_0,rgba(255,255,255,.035)_12.5%,transparent_12.5%,transparent_25%)]" />
        <div className="absolute inset-3 border border-white/45" /><div className="absolute left-3 right-3 top-1/2 h-px bg-white/45" /><div className="absolute left-1/2 top-1/2 h-18 w-18 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/45" />
        <div className="absolute left-1/2 top-3 h-12 w-[35%] -translate-x-1/2 border border-t-0 border-white/45" /><div className="absolute bottom-3 left-1/2 h-12 w-[35%] -translate-x-1/2 border border-b-0 border-white/45" />
        <div className="absolute left-1/2 top-3 h-4 w-[16%] -translate-x-1/2 border border-t-0 border-white/45" /><div className="absolute bottom-3 left-1/2 h-4 w-[16%] -translate-x-1/2 border border-b-0 border-white/45" />
        {FIELD_STAGES.map(renderPlayer)}
        <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-b-lg bg-black/45 px-3 py-1 text-[7px] font-black uppercase tracking-[.18em] text-white/70">Ataque</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-t-lg bg-black/45 px-3 py-1 text-[7px] font-black uppercase tracking-[.18em] text-white/70">Defesa</span>
      </div>

      <div className="mt-3 rounded-2xl border border-[#bd82ff]/30 bg-[#241136]/55 p-3">
        <div className="flex items-start gap-3"><Crown className="mt-0.5 h-5 w-5 shrink-0 text-[#d7adff]" /><div><p className="text-xs font-black text-white">{selected.label} · {rangeLabel(selected)}</p><p className="mt-1 text-[11px] leading-5 text-white/65">{progress >= selected.end ? "Etapa concluída. Você já garantiu este espaço na sua jornada." : progress >= selected.start ? "Você está nesta posição: continue jogando para avançar." : "Posição bloqueada. Continue participando para chegar até aqui."}</p>{selectedMilestones.length > 0 && <p className="mt-2 text-[10px] font-bold text-[#d7adff]">{selectedMilestones.map((milestone) => `Marco da casa ${milestone}`).join(" · ")} · recompensa cosmética em breve</p>}</div></div>
      </div>
    </section>
  );
}
