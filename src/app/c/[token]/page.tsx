import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Entrada curta para convites compartilhados em mensageiros. */
export default async function CompactCallupInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/convocacao?invite=${encodeURIComponent(token)}`);
}
