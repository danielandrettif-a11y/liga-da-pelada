"use client";

import { useEffect, useState } from "react";
import type { SeasonPassDashboard } from "@/lib/actions/fantasy";
import type { CosmeticPassReward, CosmeticsDashboard } from "@/lib/actions/cosmetics";
import { SeasonPassBoard } from "./SeasonPassBoard";
import { PassRewardPicker } from "./PassRewardPicker";

export function SeasonPassRewards({ pass, cosmetics, rewardId }: { pass: SeasonPassDashboard; cosmetics: CosmeticsDashboard; rewardId?: string }) {
  const [openReward, setOpenReward] = useState<CosmeticPassReward | null>(null);
  const [locallyClaimedRewardIds, setLocallyClaimedRewardIds] = useState<string[]>([]);
  useEffect(() => { if (rewardId) setOpenReward(cosmetics.rewards.find((reward) => reward.id === rewardId) || null); }, [rewardId, cosmetics.rewards]);
  useEffect(() => {
    setLocallyClaimedRewardIds((current) => current.filter((rewardIdItem) => {
      const reward = cosmetics.rewards.find((item) => item.id === rewardIdItem);
      return !reward?.selectedCosmeticId;
    }));
  }, [cosmetics.rewards]);

  const hasSiblingReward = Boolean(openReward && cosmetics.rewards.some((reward) => reward.house === openReward.house && reward.id !== openReward.id));
  const closeReward = () => setOpenReward(null);

  return <>
    <SeasonPassBoard
      progress={pass.progress}
      playerName={pass.playerName}
      playerAvatarUrl={pass.playerAvatarUrl}
      rewards={cosmetics.rewards}
      locallyClaimedRewardIds={locallyClaimedRewardIds}
      onOpenReward={setOpenReward}
    />
    <PassRewardPicker
      reward={openReward}
      progress={pass.progress}
      playerName={pass.playerName}
      playerAvatarUrl={pass.playerAvatarUrl}
      onBack={hasSiblingReward ? closeReward : undefined}
      onClaimed={(claimedRewardId) => setLocallyClaimedRewardIds((current) => current.includes(claimedRewardId) ? current : [...current, claimedRewardId])}
      onClose={closeReward}
    />
  </>;
}
