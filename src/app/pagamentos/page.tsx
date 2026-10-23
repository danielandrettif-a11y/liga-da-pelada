import { ArrowLeftRight, Clock3 } from "@/components/icons";
import { PaymentChecklist } from "@/components/PaymentChecklist";
import { PaymentObligationsPanel } from "@/components/PaymentObligationsPanel";
import { getExpenseItems, getPaymentRounds, getRoundPaymentWorkspace } from "@/lib/actions/payments";
import { getCurrentAccount } from "@/lib/auth";
import { findLatestReleasedPaymentRound } from "@/lib/paymentStatus";

export const revalidate = 0;

export default async function PagamentosPage() {
  const roundsPromise = getPaymentRounds();
  const workspacePromise = roundsPromise.then((availableRounds) => {
    const round = findLatestReleasedPaymentRound(availableRounds);
    return round ? getRoundPaymentWorkspace(round.id) : null;
  });
  const accountPromise = getCurrentAccount();
  const expenseItemsPromise = accountPromise.then((account) => account.isAdmin ? getExpenseItems(true) : []);
  const [rounds, account, workspace, expenseItems] = await Promise.all([
    roundsPromise,
    accountPromise,
    workspacePromise,
    expenseItemsPromise,
  ]);
  const players = workspace?.players || [];
  const obligations = workspace?.obligations || [];
  const expenseSelections = workspace?.expenseSelections || [];
  const chargeLines = workspace?.chargeLines || [];
  const currentRound = findLatestReleasedPaymentRound(rounds);
  const latestScheduledRound = rounds[0] || null;
  const paymentsReleased = Boolean(currentRound);
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-black text-foreground">Transfermarket</h1>
        </div>
        <p className="mt-1 text-xs text-muted">A central de pagamentos da rodada mais recente.</p>
      </div>

      {!paymentsReleased || !currentRound ? (
        <div className="glass-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <Clock3 className="h-8 w-8 text-accent" />
          </div>
          <h2 className="mt-4 text-lg font-black text-foreground">
            {!latestScheduledRound
              ? "Aguardando a próxima pelada"
              : latestScheduledRound.status === "finished"
                ? "Aguardando os dados do pagamento"
                : `${latestScheduledRound.round_type === "friendly" ? "Amistoso" : "Rodada"} ${String(latestScheduledRound.number).padStart(2, "0")} em andamento`}
          </h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
            Aguardando a rodada terminar para liberar o PIX, o valor por pessoa e a lista de pagamentos.
          </p>
        </div>
      ) : (
        obligations.length > 0 ? <PaymentObligationsPanel initialObligations={obligations} players={players} canManage={account.isAdmin} currentPlayerId={account.profile?.player_id || null} roundId={currentRound.id} expenseItems={expenseItems} initialExpenseSelections={expenseSelections} chargeLines={chargeLines} round={currentRound} /> : <PaymentChecklist
          round={currentRound}
          initialPlayers={players}
          canEdit={!!account.user}
          canManagePayment={account.isAdmin}
          currentPlayerId={account.profile?.player_id || null}
        />
      )}
    </div>
  );
}
