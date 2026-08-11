import Link from "next/link";
import { CallupBoard } from "@/components/CallupBoard";
import { CalendarPlus } from "@/components/icons";
import { getActiveCallup } from "@/lib/actions/callups";
import { getPlayers } from "@/lib/actions/players";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function ConvocacaoPage() {
  const [callup, account] = await Promise.all([getActiveCallup(), getCurrentAccount()]);
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

  const selectablePlayers = account.isAdmin ? await getPlayers(true) : [];
  return <CallupBoard callup={callup} currentPlayerId={account.profile?.player_id || null} isAuthenticated={Boolean(account.user)} isAdmin={account.isAdmin} selectablePlayers={selectablePlayers} />;
}

