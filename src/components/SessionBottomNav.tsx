import { getCurrentAccount } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { hasActiveCallup } from "@/lib/actions/callups";
import { hasPendingPaymentRound } from "@/lib/actions/payments";
import { getRosterUnreadState } from "@/lib/actions/registrations";
import { getActiveCollectiveSummary } from "@/lib/actions/collective";
import { canUseCollective } from "@/lib/collective-access";
import { getSelectedLeague } from "@/lib/league-context";

export async function SessionBottomNav() {
  // A leitura da sessão acontece primeiro para sinalizar renderização dinâmica
  // ao Next. O cache do React compartilha esta mesma consulta com o cabeçalho.
  const account = await getCurrentAccount().catch(() => ({ client: null as any, user: null, profile: null, isAdmin: false }));
  const league = account.user
    ? await getSelectedLeague().catch(() => null)
    : null;

  // Use a mesma resolução do cabeçalho: quando a conta só possui uma pelada,
  // ela é selecionada mesmo que o cookie ainda não exista ou tenha expirado.
  // O AppChrome continua ocultando esta barra no lobby e nas páginas públicas.
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

