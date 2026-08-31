"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle2, Sparkles, X } from "@/components/icons";
import type { CosmeticPassReward } from "@/lib/actions/cosmetics";
import { COSMETIC_SLOT_LABELS } from "@/lib/fantasy/cosmetics";
import { useDialogViewport } from "@/lib/useDialogViewport";

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
    [13, 8.8, 39.5], [14, 20, 39.5], [15, 8.8, 47.8], [16, 20, 47.8], [17, 8.8, 55.8], [18, 20, 55.8],
    [19, 8.8, 63.7], [20, 20, 63.7], [21, 8.8, 71.6], [22, 20, 71.6], [23, 8.8, 79.5], [24, 20, 79.5],
  ].map(([house, x, y]) => ({ id: `bench-${house}`, houses: [house], name: "Banco de reservas", shortLabel: String(house), zone: "bench" as const, x, y })),
  // Os quadrados do campo devem ocupar os círculos desenhados na arte, sem
  // criar uma segunda formação visual por cima do 4-3-3 original.
  { id: "field-gol", houses: [25], name: "Goleiro", shortLabel: "GOL", zone: "field", x: 61.5, y: 34.7 },
  { id: "field-ld", houses: [26], name: "Lateral direito", shortLabel: "LD", zone: "field", x: 36.8, y: 43.6 },
  { id: "field-zagd", houses: [27], name: "Zagueiro direito", shortLabel: "ZAG", zone: "field", x: 53, y: 43.6 },
  { id: "field-zage", houses: [28], name: "Zagueiro esquerdo", shortLabel: "ZAG", zone: "field", x: 70.3, y: 43.6 },
  { id: "field-le", houses: [29], name: "Lateral esquerdo", shortLabel: "LE", zone: "field", x: 86.4, y: 43.6 },
  { id: "field-vol", houses: [30, 31], name: "Volante", shortLabel: "VOL", zone: "field", x: 61.5, y: 54.6 },
  { id: "field-mc", houses: [32, 33], name: "Meia central", shortLabel: "MC", zone: "field", x: 49, y: 67 },
  { id: "field-mei", houses: [34], name: "Meia ofensivo", shortLabel: "MEI", zone: "field", x: 73.4, y: 67 },
  { id: "field-pd", houses: [35, 36], name: "Ponta direita", shortLabel: "PD", zone: "field", x: 39.3, y: 78.7 },
  { id: "field-ca", houses: [37], name: "Centroavante", shortLabel: "CA", zone: "field", x: 61.5, y: 78.7 },
  { id: "field-pe", houses: [38, 39], name: "Ponta esquerda", shortLabel: "PE", zone: "field", x: 83.8, y: 78.7 },
  { id: "field-legend", houses: [40], name: "Lenda do Futebol BQ", shortLabel: "LENDA", zone: "field", x: 61.5, y: 91.2 },
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
  locallyClaimedRewardIds,
  onOpenReward,
}: {
  progress: number;
  playerName: string | null;
  playerAvatarUrl: string | null;
  rewards: CosmeticPassReward[];
  locallyClaimedRewardIds: string[];
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
  const [rewardPickerStageId, setRewardPickerStageId] = useState<string | null>(null);
  const selectedStage = STAGES.find((item) => item.id === selectedStageId) || currentStage;
  const rewardPickerStage = STAGES.find((item) => item.id === rewardPickerStageId) || null;
  const rewardPickerRewards = rewardPickerStage?.houses.flatMap((house) => rewardsByHouse.get(house) || []) || [];
  const selectedRewards = selectedStage.houses.flatMap((house) => rewardsByHouse.get(house) || []);
  const selectedSecret = selectedStage.houses.includes(40) && progress < 40;
  const selectedCompleted = progress >= selectedStage.houses[selectedStage.houses.length - 1];
  const openStage = (item: Stage) => {
    setSelectedStageId(item.id);
    const stageRewards = item.houses.flatMap((house) => rewardsByHouse.get(house) || []);
    if (stageRewards.length === 1) onOpenReward(stageRewards[0]);
    if (stageRewards.length > 1) setRewardPickerStageId(item.id);
  };

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
            const shape = item.zone === "stands"
              ? "aspect-[0.87] w-[11.4%] rounded-[12%]"
              : item.zone === "bench"
                ? "aspect-[0.96] w-[10.4%] rounded-[10%]"
                : `${isLegend ? "w-[13.5%]" : "w-[10.5%]"} aspect-square rounded-[24%]`;
            const surface = isCompleted
              ? "border-emerald-300/55 bg-[#08311f]"
              : item.zone === "stands"
                ? "border-white/25 bg-[#030806]"
                : item.zone === "bench"
                  ? "border-white/25 bg-[#06100b]"
                  : "border-white/25 bg-[#07130b]";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openStage(item)}
                className={`absolute z-20 touch-pan-y -translate-x-1/2 -translate-y-1/2 border shadow-[0_2px_6px_rgba(0,0,0,.7)] transition active:scale-95 ${shape} ${surface} ${isCurrent ? "ring-2 ring-accent shadow-[0_0_13px_rgba(204,255,0,.65)]" : ""} ${isSelected && !isCurrent ? "ring-1 ring-white/65" : ""}`}
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
                onClick={() => selectedRewards.length > 1 ? setRewardPickerStageId(selectedStage.id) : onOpenReward(reward)}
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
      <HouseRewardsDialog
        stage={rewardPickerStage}
        rewards={rewardPickerRewards}
        progress={progress}
        locallyClaimedRewardIds={locallyClaimedRewardIds}
        onClose={() => setRewardPickerStageId(null)}
        onOpenReward={onOpenReward}
      />
    </section>
  );
}

function HouseRewardsDialog({
  stage,
  rewards,
  progress,
  locallyClaimedRewardIds,
  onClose,
  onOpenReward,
}: {
  stage: Stage | null;
  rewards: CosmeticPassReward[];
  progress: number;
  locallyClaimedRewardIds: string[];
  onClose: () => void;
  onOpenReward: (reward: CosmeticPassReward) => void;
}) {
  useDialogViewport(Boolean(stage));
  if (!stage) return null;

  const isClaimed = (reward: CosmeticPassReward) => reward.rewardType === "card_pack"
    ? progress >= reward.house
    : Boolean(reward.selectedCosmeticId || locallyClaimedRewardIds.includes(reward.id));
  const claimedCount = rewards.filter(isClaimed).length;
  const pendingCount = rewards.length - claimedCount;
  const unlocked = rewards.some((reward) => progress >= reward.house);
  const heading = !unlocked ? "Prêmios desta casa" : pendingCount === 0 ? "Escolhas concluídas" : claimedCount > 0 ? "Continue escolhendo" : "Escolha seus prêmios";
  const statusText = !unlocked
    ? `${rewards.length} categorias serão liberadas nesta casa.`
    : pendingCount === 0
      ? "Todas as categorias desta casa já foram escolhidas."
      : `Falta escolher ${pendingCount} ${pendingCount === 1 ? "categoria" : "categorias"}.`;

  return (
    <div className="mobile-dialog-backdrop z-[100] bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Prêmios da casa ${houseLabel(stage.houses)}`} onClick={onClose}>
      <section className="mobile-dialog-panel w-full max-w-sm rounded-3xl border border-yellow-300/35 bg-[#07150d] p-4 shadow-[0_24px_70px_rgba(0,0,0,.9)]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-athletic text-[10px] font-black uppercase tracking-[.16em] text-yellow-300">Casa {houseLabel(stage.houses)} · Passe BQ</p>
            <h2 className="mt-1 text-lg font-black text-white">{heading}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">Esta casa entrega {rewards.length} categorias. Abra cada uma para comparar os itens.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </header>
        <div className={`mt-4 flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-bold ${pendingCount === 0 && unlocked ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200" : "border-accent/25 bg-accent/10 text-accent"}`}>
          {pendingCount === 0 && unlocked ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}
          {statusText}
        </div>
        <div className="mt-4 space-y-2">
          {rewards.map((reward, index) => {
            const claimed = isClaimed(reward);
            const statusLabel = reward.rewardType === "card_pack"
              ? claimed ? "Recebido" : "Ver"
              : claimed ? "Escolhido" : unlocked ? "Escolher" : "Ver";
            return (
              <button key={reward.id} type="button" onClick={() => onOpenReward(reward)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-yellow-300/25 bg-yellow-950/20 px-3 py-3 text-left transition-colors hover:bg-yellow-950/35 active:scale-[.99]">
                <span className="min-w-0">
                  <span className="block text-[8px] font-black uppercase tracking-[.12em] text-yellow-200/65">Categoria {index + 1}</span>
                  <strong className="block truncate text-xs text-yellow-100">{reward.house === 40 ? "Recompensa lendária" : rewardLabel(reward)}</strong>
                </span>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-black uppercase ${claimed ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-300/10 text-yellow-200"}`}>
                  {claimed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {statusLabel}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
