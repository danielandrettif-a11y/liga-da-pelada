import Link from "next/link";
import { Banknote } from "lucide-react";
import { PaymentChecklist } from "@/components/PaymentChecklist";
import { getPaymentRounds, getRoundPaymentPlayers } from "@/lib/actions/payments";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function PagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ rodada?: string }>;
}) {
  const rounds = await getPaymentRounds();
  const { rodada } = await searchParams;
  const selectedRound = rounds.find((round) => round.id === rodada) || rounds[0] || null;
  const players = selectedRound ? await getRoundPaymentPlayers(selectedRound.id) : [];
  const account = await getCurrentAccount();

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-black text-foreground">Pagamento da Pelada</h1>
        </div>
        <p className="mt-1 text-xs text-muted">Copie o PIX e acompanhe os pagamentos de cada rodada.</p>
      </div>

      {rounds.length > 0 ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {rounds.map((round) => (
              <Link
                key={round.id}
                href={`/pagamentos?rodada=${round.id}`}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold ${selectedRound?.id === round.id ? "border-accent bg-accent text-background" : "border-border bg-surface text-muted"}`}
              >
                Rodada {round.number}
              </Link>
            ))}
          </div>
          {selectedRound && <PaymentChecklist round={selectedRound} initialPlayers={players} canEdit={account.isAdmin} />}
        </>
      ) : (
        <div className="glass-card p-8 text-center">
          <Banknote className="mx-auto h-10 w-10 text-muted/50" />
          <p className="mt-3 text-sm font-bold text-foreground">Nenhuma rodada nesta temporada</p>
          <p className="mt-1 text-xs text-muted">A lista de pagamentos aparecera depois que uma rodada for criada.</p>
        </div>
      )}
    </div>
  );
}
