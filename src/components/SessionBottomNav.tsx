import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { hasActiveCallup } from "@/lib/actions/callups";
import { hasPendingPaymentRound } from "@/lib/actions/payments";
import { getRosterUnreadState } from "@/lib/actions/registrations";
import { getActiveCollectiveSummary } from "@/lib/actions/collective";
import { canUseCollective } from "@/lib/collective-access";
import { ACTIVE_LEAGUE_COOKIE, getSelectedLeague } from "@/lib/league-context";
import { cookies } from "next/headers";

export async function SessionBottomNav() {
  // A leitura da sessão acontece primeiro para sinalizar renderização dinâmica
  // ao Next. O cache do React compartilha esta mesma consulta com o cabeçalho.
  const account = await getCurrentAccount().catch(() => ({ client: null as any, user: null, profile: null, isAdmin: false }));
  const selectedLeagueId = account.user
    ? (await cookies()).get(ACTIVE_LEAGUE_COOKIE)?.value
    : null;
  const selectedLeague = account.user && selectedLeagueId
    ? await getSelectedLeague().catch(() => null)
    : null;
  const league = selectedLeague?.id === selectedLeagueId ? selectedLeague : null;

  // A barra representa ações internas de uma pelada. Sem uma escolha explícita
  // no lobby, não existe contexto suficiente para exibi-la.
  if (!account.user || !league) return null;

  const [hasOpenCallup, hasPendingPayment, rosterUnread, collective, linkedPlayer] = await Promise.all([
    account.user && league ? hasActiveCallup().catch(() => false) : Promise.resolve(false),
    account.user && league ? hasPendingPaymentRound().catch(() => false) : Promise.resolve(false),
    account.isAdmin && league ? getRosterUnreadState().catch(() => ({ count: 0, lastSeenAt: null })) : Promise.resolve({ count: 0, lastSeenAt: null }),
    account.user && league?.featureTier === "complete" ? getActiveCollectiveSummary().catch(() => null) : Promise.resolve(null),
    account.profile?.player_id && league
      ? account.client.from("players").select("member_category").eq("id", account.profile.player_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <BottomNav
      isAuthenticated={Boolean(account.user)}
      featureTier={league?.featureTier || "basic"}
      hasOpenCallup={hasOpenCallup}
      hasPendingPayment={hasPendingPayment}
      canAccessCollective={canUseCollective(account.isAdmin, linkedPlayer.data?.member_category)}
      collective={collective ? { callupId: collective.callupId, unreadCount: collective.unreadCount } : null}
      newRosterCount={rosterUnread.count}
      currentUserId={account.user?.id || null}
    />
  );
}

