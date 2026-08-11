import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, CheckCircle2, Clock, RotateCcw } from "@/components/icons";
import { getPaymentAuditLog, type PaymentAuditLogEntry } from "@/lib/actions/payments";
import { getCurrentAccount } from "@/lib/auth";
import { formatDateShort } from "@/lib/utils";

export const revalidate = 0;

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type AuditGroup = {
  round: PaymentAuditLogEntry["round"];
  entries: PaymentAuditLogEntry[];
};

export default async function TransfermarketHistoryPage() {
  const account = await getCurrentAccount();
  if (!account.user) redirect("/login?next=/admin/transfermarket");
  if (!account.isAdmin) redirect("/mais");

  const auditEntries = await getPaymentAuditLog();
  const groups = new Map<string, AuditGroup>();

  for (const entry of auditEntries) {
    const current = groups.get(entry.round_id) || { round: entry.round, entries: [] };
    current.entries.push(entry);
    groups.set(entry.round_id, current);
  }

  const roundGroups = [...groups.values()].map((group) => ({
    ...group,
    entries: [...group.entries].sort((a, b) => a.id - b.id),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/mais" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface hover:bg-surface-hover">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-accent" />
            <h1 className="truncate text-xl font-black text-foreground">Histórico do Transfermarket</h1>
          </div>
          <p className="mt-0.5 text-xs text-muted">Auditoria exclusiva dos administradores</p>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
        <p className="text-xs font-black text-accent">Registro de cada clique</p>
        <p className="mt-1 text-[11px] leading-5 text-muted">
          A ordem abaixo mostra quem marcou ou desmarcou cada pagamento. O registro não pode ser editado pelos usuários.
        </p>
      </div>

      {roundGroups.length === 0 ? (
        <div className="glass-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <Clock className="h-10 w-10 text-muted" />
          <h2 className="mt-4 text-base font-black text-foreground">Nenhuma movimentação registrada</h2>
          <p className="mt-2 max-w-xs text-xs leading-5 text-muted">
            O histórico começará a aparecer depois da primeira marcação feita com a migration 022 ativa.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {roundGroups.map((group) => (
            <section key={group.entries[0].round_id} className="glass-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/70 px-4 py-3">
                <div>
                  <h2 className="text-sm font-black text-foreground">
                    {group.round?.round_type === "friendly" ? "Amistoso" : "Rodada"} {String(group.round?.number || 0).padStart(2, "0")}
                  </h2>
                  <p className="mt-0.5 text-[10px] text-muted">{group.round ? formatDateShort(group.round.date) : "Rodada removida"}</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[9px] font-black text-muted">
                  {group.entries.length} {group.entries.length === 1 ? "ação" : "ações"}
                </span>
              </div>

              <div className="divide-y divide-border">
                {group.entries.map((entry, index) => (
                  <div key={entry.id} className="flex gap-3 px-4 py-3.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-athletic text-xs font-black ${entry.paid ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        {entry.paid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                        <p className="min-w-0 text-xs leading-5 text-foreground">
                          <strong>{entry.changed_by_name}</strong>{" "}
                          {entry.paid ? "marcou como pago" : "desmarcou o pagamento de"}{" "}
                          <strong>{entry.target_player_name}</strong>
                        </p>
                      </div>
                      <p className="mt-1 pl-6 text-[9px] font-semibold uppercase tracking-wide text-muted">
                        {timestampFormatter.format(new Date(entry.created_at))} · evento #{entry.id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
