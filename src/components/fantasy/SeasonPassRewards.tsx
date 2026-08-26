"use client";

import { useEffect, useState } from "react";
import type { SeasonPassDashboard } from "@/lib/actions/fantasy";
import type { CosmeticPassReward, CosmeticsDashboard } from "@/lib/actions/cosmetics";
import { SeasonPassBoard } from "./SeasonPassBoard";
import { PassRewardModal } from "./PassRewardModal";

export function SeasonPassRewards({ pass, cosmetics, rewardId }: { pass: SeasonPassDashboard; cosmetics: CosmeticsDashboard; rewardId?: string }) {
  const [openReward, setOpenReward] = useState<CosmeticPassReward | null>(null);
  useEffect(() => { if (rewardId) setOpenReward(cosmetics.rewards.find((reward) => reward.id === rewardId) || null); }, [rewardId, cosmetics.rewards]);
  return <><SeasonPassBoard progress={pass.progress} playerName={pass.playerName} playerAvatarUrl={pass.playerAvatarUrl} rewards={cosmetics.rewards} onOpenReward={setOpenReward} /><PassRewardModal reward={openReward} progress={pass.progress} onClose={() => setOpenReward(null)} /></>;
}
