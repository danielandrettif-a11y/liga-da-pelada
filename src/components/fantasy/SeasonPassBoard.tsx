"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "@/components/icons";
import type { CosmeticPassReward } from "@/lib/actions/cosmetics";
import { COSMETIC_SLOT_LABELS } from "@/lib/fantasy/cosmetics";

type Zone = "stands" | "bench" | "field";
type Stage = {
  id: string;
  houses: number[];
  name: string;
  shortLabel: string;
  zone: Zone;
  x: number;
  y: number;
};

const STAGES: Stage[] = [
  ...[
    [1, 13.5, 11.2], [2, 28.1, 11.2], [3, 42.7, 11.2], [4, 57.3, 11.2], [5, 71.9, 11.2], [6, 86.5, 11.2],
    [7, 13.5, 21], [8, 28.1, 21], [9, 42.7, 21], [10, 57.3, 21], [11, 71.9, 21], [12, 86.5, 21],
  ].map(([house, x, y]) => ({ id: `stands-${house}`, houses: [house], name: "Arquibancada", shortLabel: String(house), zone: "stands" as const, x, y })),
  ...[
    [13, 8.8, 39.5], [14, 19.5, 39.5], [15, 8.8, 47.8], [16, 19.5, 47.8], [17, 8.8, 56.1], [18, 19.5, 56.1],
    [19, 8.8, 64.4], [20, 19.5, 64.4], [21, 8.8, 72.7], [22, 19.5, 72.7], [23, 8.8, 81], [24, 19.5, 81],
  ].map(([house, x, y]) => ({ id: `bench-${house}`, houses: [house], name: "Banco de reservas", shortLabel: String(house), zone: "bench" as const, x, y })),
  { id: "field-gol", houses: [25], name: "Goleiro", shortLabel: "GOL", zone: "field", x: 63.5, y: 34 },
  { id: "field-ld", houses: [26], name: "Lateral direito", shortLabel: "LD", zone: "field", x: 38, y: 45.5 },
  { id: "field-zagd", houses: [27], name: "Zagueiro direito", shortLabel: "ZAG", zone: "field", x: 55, y: 45.5 },
  { id: "field-zage", houses: [28], name: "Zagueiro esquerdo", shortLabel: "ZAG", zone: "field", x: 72, y: 45.5 },
  { id: "field-le", houses: [29], name: "Lateral esquerdo", shortLabel: "LE", zone: "field", x: 89, y: 45.5 },
  { id: "field-vol", houses: [30, 31], name: "Volante", shortLabel: "VOL", zone: "field", x: 44, y: 63 },
  { id: "field-mc", houses: [32, 33], name: "Meia central", shortLabel: "MC", zone: "field", x: 63.5, y: 63 },
  { id: "field-mei", houses: [34], name: "Meia ofensivo", shortLabel: "MEI", zone: "field", x: 83, y: 63 },
  { id: "field-pd", houses: [35, 36], name: "Ponta direita", shortLabel: "PD", zone: "field", x: 40, y: 78 },
  { id: "field-ca", houses: [37], name: "Centroavante", shortLabel: "CA", zone: "field", x: 63.5, y: 78 },
  { id: "field-pe", houses: [38, 39], name: "Ponta esquerda", shortLabel: "PE", zone: "field", x: 87, y: 78 },
  { id: "field-legend", houses: [40], name: "Lenda do Futebol BQ", shortLabel: "LENDA", zone: "field", x: 63.5, y: 91 },
];

function houseLabel(houses: number[]) {
  return houses.length === 1 ? String(houses[0]) : `${houses[0]}–${houses[houses.length - 1]}`;
}

function rewardLabel(reward: CosmeticPassReward) {
  if (reward.rewardType === "card_pack") return `Pacote ${reward.cardTier === "gold" ? "Ouro" : "Bronze"}`;
  return `Escolha · ${COSMETIC_SLOT_LABELS[reward.options[0]?.slot || "title"]}`;
}

export function SeasonPassBoard({
  progress,
  playerName,
  playerAvatarUrl,
  rewards,
  onOpenReward,
}: {
  progress: number;
  playerName: string | null;
  playerAvatarUrl: string | null;
  rewards: CosmeticPassReward[];
  onOpenReward: (reward: CosmeticPassReward) => void;
}) {
  const rewardsByHouse = useMemo(() => {
    const grouped = new Map<number, CosmeticPassReward[]>();
    for (const reward of rewards) grouped.set(reward.house, [...(grouped.get(reward.house) || []), reward]);
    return grouped;
  }, [rewards]);
  const currentHouse = Math.max(1, Math.min(40, progress || 1));
  const currentStage = STAGES.find((item) => item.houses.includes(currentHouse)) || STAGES[0];
  const [selectedStageId, setSelectedStageId] = useState(currentStage.id);
  const selectedStage = STAGES.find((item) => item.id === selectedStageId) || currentStage;
  const selectedRewards = selectedStage.houses.flatMap((house) => rewardsByHouse.get(house) || []);
  const selectedSecret = selectedStage.houses.includes(40) && progress < 40;
  const selectedCompleted = progress >= selectedStage.houses[selectedStage.houses.length - 1];

  return (
    <section className="-mx-2 overflow-hidden rounded-[1.6rem] border border-accent/25 bg-[#051109] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,.45)] sm:mx-0 sm:p-3">
      <header className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pt-1.5">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[.18em] text-accent">Passe de temporada</p>
          <h2 className="mt-0.5 truncate font-athletic text-base font-black uppercase italic text-white">
            {playerName || "Jogador"} · casa {currentHouse}
          </h2>
        </div>
        <span className="shrink-0 rounded-xl border border-accent/30 bg-accent/10 px-2.5 py-1 text-center text-lg font-black text-accent">
          {progress}<small className="ml-1 text-[7px] uppercase text-accent/70">/40</small>
        </span>
      </header>

      <div className="relative touch-pan-y overflow-hidden rounded-[1.35rem] border border-accent/20 bg-black">
        <Image
          src="/images/season-pass-board.jpg"
          alt="Trilha do Passe de Temporada em formação 4-3-3"
          width={683}
          height={1024}
          sizes="(max-width: 32rem) calc(100vw - .5rem), 34rem"
          className="pointer-events-none block h-auto w-full select-none opacity-90"
          loading="eager"
        />
        <div className="pointer-events-none absolute inset-x-[4%] top-[3.3%] z-10 flex justify-center"><span className="rounded bg-black/65 px-2 py-0.5 text-[6px] font-black uppercase tracking-[.18em] text-white/65">Arquibancada · 1–12</span></div>
        <div className="pointer-events-none absolute left-[4%] top-[31.2%] z-10"><span className="rounded bg-black/65 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[.14em] text-white/65">Banco · 13–24</span></div>
        <div className="pointer-events-none absolute left-[44%] top-[28.7%] z-10"><span className="rounded bg-black/65 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[.14em] text-accent/80">4-3-3 · 25–40</span></div>

        <div className="absolute inset-0 touch-pan-y">
          {STAGES.map((item) => {
            const stageRewards = item.houses.flatMap((house) => rewardsByHouse.get(house) || []);
            const rewardCount = stageRewards.length;
            const isCurrent = item.houses.includes(currentHouse);
            const isCompleted = progress >= item.houses[item.houses.length - 1];
            const isSelected = item.id === selectedStage.id;
            const isLegend = item.houses.includes(40);
            const size = item.zone === "stands" ? "w-[10.2%]" : item.zone === "bench" ? "w-[9.8%]" : isLegend ? "w-[15%]" : "w-[12.2%]";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedStageId(item.id)}
                className={`absolute z-20 aspect-square touch-pan-y -translate-x-1/2 -translate-y-1/2 rounded-[24%] border bg-black/78 shadow-[0_2px_6px_rgba(0,0,0,.55)] transition active:scale-95 ${size} ${
                  isCompleted ? "border-emerald-300/55 bg-emerald-950/75" : "border-white/25"
                } ${isCurrent ? "ring-2 ring-accent shadow-[0_0_13px_rgba(204,255,0,.65)]" : ""} ${isSelected && !isCurrent ? "ring-1 ring-white/65" : ""}`}
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
                aria-label={`${item.name}, ${item.houses.length > 1 ? "casas" : "casa"} ${houseLabel(item.houses)}, ${rewardCount} recompensa${rewardCount === 1 ? "" : "s"}`}
              >
                <span className="flex h-full w-full flex-col items-center justify-center leading-none">
                  {isCurrent && playerAvatarUrl ? (
                    <img src={playerAvatarUrl} alt={playerName || "Jogador"} className="h-[58%] w-[58%] rounded-full border border-accent object-cover" />
                  ) : item.zone === "field" ? (
                    <strong className={`text-[clamp(5px,1.55vw,8px)] ${isLegend ? "text-yellow-200" : "text-white/85"}`}>{item.shortLabel}</strong>
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-[32%] w-[32%] text-emerald-300/80" />
                  ) : null}
                  <small className="mt-[10%] text-[clamp(5px,1.35vw,7px)] font-black text-white/55">{houseLabel(item.houses)}</small>
                </span>
                {rewardCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-[28%] min-h-2.5 min-w-2.5 items-center justify-center rounded-full border border-yellow-200/80 bg-yellow-400 px-0.5 text-[clamp(5px,1.25vw,7px)] font-black text-black shadow-[0_0_7px_rgba(250,204,21,.65)]">
                    {rewardCount > 1 ? rewardCount : <Sparkles className="h-[65%] w-[65%]" />}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 rounded-[1.2rem] border border-white/10 bg-[#08170e] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[.14em] text-muted">
              {selectedStage.zone === "stands" ? "Arquibancada" : selectedStage.zone === "bench" ? "Banco de reservas" : "Formação 4-3-3"} · {selectedStage.houses.length > 1 ? "casas" : "casa"} {houseLabel(selectedStage.houses)}
            </p>
            <h3 className="mt-0.5 truncate text-sm font-black text-white">{selectedStage.name}</h3>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[7px] font-black uppercase ${selectedCompleted ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-muted"}`}>
            {selectedCompleted ? "Concluída" : "Bloqueada"}
          </span>
        </div>

        {selectedRewards.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-[9px] font-bold text-yellow-200/80">
              {selectedSecret ? `${selectedRewards.length} recompensa${selectedRewards.length > 1 ? "s" : ""} secreta${selectedRewards.length > 1 ? "s" : ""}` : `${selectedRewards.length} recompensa${selectedRewards.length > 1 ? "s" : ""} nesta etapa`}
            </p>
            {selectedRewards.map((reward, index) => (
              <button
                key={reward.id}
                type="button"
                onClick={() => onOpenReward(reward)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-yellow-400/20 bg-yellow-950/15 px-3 py-2 text-left active:bg-yellow-950/30"
              >
                <span className="min-w-0">
                  <span className="block text-[8px] font-black uppercase tracking-[.12em] text-yellow-300/70">Casa {reward.house} · prêmio {index + 1}</span>
                  <strong className="block truncate text-[10px] text-yellow-100">{selectedSecret ? "Recompensa secreta" : rewardLabel(reward)}</strong>
                </span>
                <Sparkles className="h-4 w-4 shrink-0 text-yellow-300" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] leading-4 text-muted">Esta é uma casa de progresso. Continue avançando para encontrar o próximo prêmio.</p>
        )}
      </div>
    </section>
  );
}
