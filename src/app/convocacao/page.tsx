import Link from "next/link";
import type { Metadata } from "next";
import { CallupBoard } from "@/components/CallupBoard";
import { CalendarPlus } from "@/components/icons";
import { getActiveCallup } from "@/lib/actions/callups";
import { getSelectableLeaguePlayers } from "@/lib/actions/players";
import { getCurrentAccount } from "@/lib/auth";
import { getLeagueConfig } from "@/lib/actions/league";

import { getFantasyQuickHighlights } from "@/lib/actions/fantasy";
import { getStadiums } from "@/lib/actions/stadiums";

export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const callup = await getActiveCallup();
  const dateFormatted = callup?.date
    ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(
        new Date(`${callup.date}T12:00:00`)
      )
    : "";

  const title = callup
    ? `⚽ Convocação Aberta (${dateFormatted}) - Pelada de Baixa Qualidade`
    : "Convocação - Pelada de Baixa Qualidade";

  const description = callup
    ? `Presença aberta para a próxima pelada! Toque para confirmar sua vaga ou acompanhar a lista de confirmados.`
    : "Confirme sua presença e escale seu time no Cartola.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: "/icons/pelada-bq-v2-512.png",
          width: 512,
          height: 512,
          alt: "Pelada de Baixa Qualidade",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/icons/pelada-bq-v2-512.png"],
    },
  };
}

export default async function ConvocacaoPage() {
  const [callup, account, leagueConfig, fantasyHighlights, stadiums] = await Promise.all([
    getActiveCallup(),
    getCurrentAccount(),
    getLeagueConfig(),
    getFantasyQuickHighlights(),
    getStadiums(),
  ]);
  if (!callup) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface"><CalendarPlus className="h-8 w-8 text-muted" /></div>
        <h1 className="mt-4 text-xl font-black text-foreground">Nenhuma convocação aberta</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">Quando o ADM abrir a próxima lista, ela aparecerá aqui.</p>
        <Link href="/" className="mt-6 rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Voltar ao início</Link>
      </div>
    );
  }

  // A convocação é colaborativa: qualquer pessoa logada pode escolher um
  // atleta elegível do elenco. A RPC ainda valida a liga, a abertura e a vaga.
  const selectablePlayers = account.user ? await getSelectableLeaguePlayers(callup.league_id) : [];
  const stadiumName = callup.stadium_name || leagueConfig?.stadium_name || null;
  const stadiumMapUrl = callup.stadium_map_url || leagueConfig?.stadium_map_url || null;

  return (
    <div className="min-w-0 overflow-x-clip">
      <CallupBoard
        callup={callup}
        currentUserId={account.user?.id || null}
        currentPlayerId={account.profile?.player_id || null}
        isAuthenticated={Boolean(account.user)}
        isAdmin={account.isAdmin}
        selectablePlayers={selectablePlayers}
        stadiumName={stadiumName}
        stadiumMapUrl={stadiumMapUrl}
        stadiums={stadiums}
        fantasyHighlights={fantasyHighlights}
      />
    </div>
  );
}
