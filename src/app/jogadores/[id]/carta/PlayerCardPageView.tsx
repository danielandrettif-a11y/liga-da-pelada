"use client";

import { useRouter } from "next/navigation";
import { RankingPlayerCardModal } from "@/components/RankingPlayerCardModal";
import type { RankingEntry } from "@/lib/ranking";

export function PlayerCardPageView({
  entry,
  position,
  playerId,
}: {
  entry: RankingEntry;
  position: number;
  playerId: string;
}) {
  const router = useRouter();

  return (
    <RankingPlayerCardModal
      entry={entry}
      position={position}
      onClose={() => router.push(`/jogadores/${playerId}`)}
    />
  );
}
