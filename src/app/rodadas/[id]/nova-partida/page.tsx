import { getRound } from "@/lib/actions/rounds";
import { notFound } from "next/navigation";
import { MatchCreator } from "@/components/MatchCreator";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function NovaPartidaPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const account = await getCurrentAccount();
  if (!account.isAdmin) notFound();

  const round = await getRound(id);

  if (!round) {
    notFound();
  }

  return (
    <MatchCreator round={round} />
  );
}
