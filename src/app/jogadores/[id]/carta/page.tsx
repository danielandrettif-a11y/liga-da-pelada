import { notFound } from "next/navigation";
import { getPlayerRankingEntry } from "@/lib/actions/stats";
import { PlayerCardPageView } from "./PlayerCardPageView";

export default async function PlayerCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cardData = await getPlayerRankingEntry(id);
  if (!cardData) notFound();

  return (
    <PlayerCardPageView
      entry={cardData.entry}
      position={cardData.position}
      playerId={id}
    />
  );
}
