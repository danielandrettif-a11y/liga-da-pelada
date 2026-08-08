import { getRound } from "@/lib/actions/rounds";
import { notFound } from "next/navigation";
import { MatchCreator } from "@/components/MatchCreator";

export const revalidate = 0;

export default async function NovaPartidaPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const round = await getRound(id);

  if (!round) {
    notFound();
  }

  return (
    <MatchCreator round={round} />
  );
}
