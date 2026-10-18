import type { Metadata } from "next";
import ConvocacaoPage from "@/app/convocacao/page";
import { resolveCallupInvite } from "@/lib/callup-invite-server";
import { SITE_URL } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const callup = await resolveCallupInvite(token);
  const date = callup?.date
    ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`))
    : null;
  const title = date ? `⚽ Convocação aberta · ${date}` : "⚽ Convocação aberta · Pelada BQ";
  const description = callup
    ? `Confirme sua presença${callup.stadium_name ? ` no ${callup.stadium_name}` : ""} e acompanhe a lista da pelada.`
    : "Confirme sua presença e acompanhe a lista da Pelada BQ.";
  const url = `${SITE_URL}/c/${encodeURIComponent(token)}`;
  const image = `${SITE_URL}/icons/pelada-bq-v2-512.png`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "Pelada BQ",
      images: [{ url: image, width: 512, height: 512, alt: "Pelada BQ" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function CompactCallupInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const callup = await resolveCallupInvite(token);
  return (
    <ConvocacaoPage
      searchParams={Promise.resolve({ invite: token, callup: callup?.id })}
    />
  );
}
