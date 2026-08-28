"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "@/components/icons";
import type { CosmeticPassReward } from "@/lib/actions/cosmetics";
import { COSMETIC_SLOT_LABELS } from "@/lib/fantasy/cosmetics";

type Zone = "stands" | "bench" | "field";
type Stage = { house: number; name: string; shortLabel: string; zone: Zone; x: number; y: number };
const rawStages: Array<[number, string, string, Zone, number, number]> = [
  [1,"Arquibancada · Entrada","1","stands",13.5,11.2],[2,"Arquibancada","2","stands",28.1,11.2],[3,"Arquibancada","3","stands",42.7,11.2],[4,"Arquibancada","4","stands",57.3,11.2],[5,"Arquibancada","5","stands",71.9,11.2],[6,"Arquibancada","6","stands",86.5,11.2],[7,"Arquibancada","7","stands",13.5,21],[8,"Arquibancada","8","stands",28.1,21],[9,"Arquibancada","9","stands",42.7,21],[10,"Arquibancada","10","stands",57.3,21],[11,"Arquibancada","11","stands",71.9,21],[12,"Arquibancada","12","stands",86.5,21],
  [13,"Banco de Reservas","13","bench",8.8,39.5],[14,"Banco de Reservas","14","bench",19.5,39.5],[15,"Banco de Reservas","15","bench",8.8,47.8],[16,"Banco de Reservas","16","bench",19.5,47.8],[17,"Banco de Reservas","17","bench",8.8,56.1],[18,"Banco de Reservas","18","bench",19.5,56.1],[19,"Banco de Reservas","19","bench",8.8,64.4],[20,"Banco de Reservas","20","bench",19.5,64.4],[21,"Banco de Reservas","21","bench",8.8,72.7],[22,"Banco de Reservas","22","bench",19.5,72.7],[23,"Banco de Reservas","23","bench",8.8,81],[24,"Banco de Reservas","24","bench",19.5,81],
  [25,"Goleiro Titular","GOL","field",63.5,33.8],[26,"Lateral Direito","LD","field",36.8,43.8],[27,"Zagueiro Direito","ZAG","field",54.5,43.8],[28,"Zagueiro Esquerdo","ZAG","field",72.3,43.8],[29,"Lateral Esquerdo","LE","field",90,43.8],[30,"Volante de Contenção","VOL","field",58,56.8],[31,"Volante de Contenção","VOL","field",68,56.8],[32,"Meia Central","MC","field",43,67.2],[33,"Meia Central","MC","field",56,67.2],[34,"Meia Ofensivo","MEI","field",77,67.2],[35,"Ponta Direita","PD","field",34,79.8],[36,"Ponta Direita","PD","field",46,79.8],[37,"Centroavante","CA","field",63.5,79.8],[38,"Ponta Esquerda","PE","field",80,79.8],[39,"Ponta Esquerda","PE","field",91,79.8],[40,"Lenda do Futebol BQ","LENDA","field",63.5,91.2],
];
const STAGES: Stage[] = rawStages.map(([house, name, shortLabel, zone, x, y]) => ({ house, name, shortLabel, zone, x, y }));

export function SeasonPassBoard({ progress, playerName, playerAvatarUrl, rewards, onOpenReward }: { progress: number; playerName: string | null; playerAvatarUrl: string | null; rewards: CosmeticPassReward[]; onOpenReward: (reward: CosmeticPassReward) => void }) {
  const rewardsByHouse = useMemo(() => new Map(rewards.map((reward) => [reward.house, reward])), [rewards]);
  const currentHouse = Math.max(1, Math.min(40, progress || 1));
  const [selectedHouse, setSelectedHouse] = useState(currentHouse);
  const stage = STAGES.find((item) => item.house === selectedHouse) || STAGES[0];
  const selectedReward = rewardsByHouse.get(selectedHouse);
  const secret = selectedReward?.house === 40 && progress < 40;
  return <section className="-mx-2 overflow-hidden rounded-[2rem] border border-accent/40 bg-[#051109] p-1.5 shadow-[0_0_50px_rgba(0,0,0,.8)] sm:mx-0 sm:p-3">
    <header className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pt-1.5"><div><p className="font-athletic text-[10px] font-black uppercase italic tracking-[.2em] text-accent">Tabuleiro oficial da temporada</p><h2 className="font-athletic text-lg font-black uppercase italic leading-tight text-white">{progress ? `${playerName || "Jogador"} · casa ${currentHouse}` : "A jornada vai começar"}</h2></div><span className="rounded-2xl border border-accent/40 bg-accent/15 px-3 py-1.5 text-center font-athletic text-xl font-black text-accent">{progress}<small className="ml-1 text-[8px] uppercase">/40</small></span></header>
    <div className="relative overflow-hidden rounded-[1.65rem] border-2 border-accent/30 bg-black">
      <Image src="/images/season-pass-board.jpg" alt="Tabuleiro oficial do Passe de Temporada" width={683} height={1024} sizes="(max-width: 32rem) calc(100vw - .5rem), 34rem" className="pointer-events-none block h-auto w-full select-none" loading="eager" />
      <div className="pointer-events-none absolute inset-x-[4%] top-[3.2%] z-10 flex justify-center"><span className="rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[6px] font-black uppercase tracking-[.18em] text-white/80">Arquibancada</span></div>
      <div className="pointer-events-none absolute left-[4%] top-[31.1%] z-10"><span className="rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[6px] font-black uppercase tracking-[.16em] text-white/80">Banco</span></div>
      <div className="pointer-events-none absolute left-[43%] top-[28.6%] z-10"><span className="rounded-md border border-accent/30 bg-black/65 px-2 py-0.5 text-[6px] font-black uppercase tracking-[.16em] text-accent">Campo · titulares</span></div>
      <div className="absolute inset-0">{STAGES.map((item) => {
        const reward = rewardsByHouse.get(item.house);
        const fieldReward = Boolean(reward && item.zone === "field");
        const isCurrent = item.house === currentHouse;
        const completed = progress >= item.house;
        const isSelected = item.house === selectedHouse;
        const isSecret = reward?.house === 40 && progress < 40;
        const size = item.zone === "stands" ? "w-[10.5%]" : item.zone === "bench" ? "w-[10%]" : item.house === 40 ? "w-[15%]" : "w-[12.5%]";
        return <button
          key={item.house}
          type="button"
          onClick={() => { setSelectedHouse(item.house); if (reward) onOpenReward(reward); }}
          className={`absolute z-20 aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22%] border shadow-[0_2px_7px_rgba(0,0,0,.65)] transition active:scale-90 ${size} ${
            reward
              ? "border-yellow-300/90 bg-gradient-to-br from-yellow-950/95 to-black/95 ring-1 ring-yellow-400/40"
              : completed
                ? "border-emerald-300/75 bg-emerald-950/90"
                : "border-white/35 bg-black/80"
          } ${isCurrent ? "ring-2 ring-accent shadow-[0_0_16px_rgba(204,255,0,.8)]" : ""} ${isSelected && !isCurrent ? "ring-2 ring-white/75" : ""}`}
          style={{ left: `${item.x}%`, top: `${item.y}%` }}
          aria-label={`Casa ${item.house}${reward ? ", recompensa" : ""}`}
        >
          <span className="absolute left-1 top-0.5 z-30 text-[clamp(6px,1.7vw,9px)] font-black leading-none text-white">{item.house}</span>
          <span className="flex h-full w-full items-center justify-center pt-1 text-[clamp(7px,2.3vw,13px)] font-black text-white">
            {isCurrent && playerAvatarUrl
              ? <img src={playerAvatarUrl} alt={playerName || "Jogador"} className="h-[72%] w-[72%] rounded-[24%] border border-accent object-cover" />
              : isCurrent
                ? <span className="text-[6px] text-accent">VOCÊ</span>
                : item.zone === "field"
                  ? <span className="text-[clamp(5px,1.5vw,8px)] text-white/80">{item.shortLabel}</span>
                  : reward
                  ? <span className="rounded border border-yellow-300/60 bg-yellow-400/15 px-1 py-0.5 text-[clamp(4px,1.35vw,7px)] font-black uppercase tracking-wide text-yellow-100">{isSecret ? "Segredo" : "Prêmio"}</span>
                  : completed
                    ? <CheckCircle2 className="h-[45%] w-[45%] text-emerald-300" />
                    : null}
          </span>
          {fieldReward && <span aria-hidden="true" className="absolute -right-1 -top-1 z-30 flex h-[28%] w-[28%] min-h-2 min-w-2 items-center justify-center rounded-full border border-yellow-200/90 bg-yellow-400 text-[clamp(4px,1vw,7px)] text-black shadow-[0_0_8px_rgba(250,204,21,.9)]"><Sparkles className="h-[68%] w-[68%]" /></span>}
          {reward && isCurrent && item.zone !== "field" && <span className="absolute bottom-0 inset-x-0 bg-yellow-400/20 py-px text-[clamp(4px,1.2vw,6px)] font-black uppercase tracking-wide text-yellow-100">Prêmio</span>}
        </button>;
      })}</div>
    </div>
    <div className="mt-2.5 rounded-[1.4rem] border border-accent/30 bg-gradient-to-r from-[#0c2416] via-[#07170e] to-surface p-3.5"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-muted">{stage.zone === "stands" ? "Arquibancada" : stage.zone === "bench" ? "Banco de reservas" : "Time titular"} · casa {stage.house}</p><h3 className="font-athletic text-base font-black uppercase italic text-white">{secret ? "Recompensa secreta" : stage.name}</h3></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${progress >= stage.house ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-muted"}`}>{progress >= stage.house ? "Concluída" : "Bloqueada"}</span></div>{selectedReward ? <button type="button" onClick={() => onOpenReward(selectedReward)} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-yellow-400/35 bg-yellow-950/25 p-3 text-left"><span><strong className="block text-xs text-yellow-300">{secret ? "Recompensa secreta" : selectedReward.rewardType === "card_pack" ? `Pacote ${selectedReward.cardTier === "gold" ? "Ouro" : "Bronze"}` : `Escolha cosmética · ${COSMETIC_SLOT_LABELS[selectedReward.options[0]?.slot || "title"]}`}</strong><span className="mt-0.5 block text-[10px] text-muted">{secret ? "Alcance a casa 40 para descobrir." : progress >= selectedReward.house ? "Toque para ver e resgatar." : "Veja os itens bloqueados e como avançar."}</span></span><Sparkles className="h-5 w-5 text-yellow-300" /></button> : <p className="mt-3 text-[11px] text-muted">{progress >= stage.house ? "Etapa concluída. Continue para o próximo marco." : "Jogue, escale no Cartola e some gols e assistências para avançar."}</p>}</div>
  </section>;
}
