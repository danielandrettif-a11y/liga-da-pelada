"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Shield, ShieldCheck, ShieldX, X } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { setAccountAdminRole, type ManagedAccount } from "@/lib/actions/admins";
import { useDialogViewport } from "@/lib/useDialogViewport";

type PendingChange = { account: ManagedAccount; makeAdmin: boolean } | null;

export function AdminRoleManager({ accounts, currentUserId }: { accounts: ManagedAccount[]; currentUserId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  useDialogViewport(Boolean(pendingChange));

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return accounts;
    return accounts.filter((account) => [account.player?.name, account.player?.nickname]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalized)));
  }, [accounts, query]);

  const admins = filtered.filter((account) => account.role === "admin");
  const players = filtered.filter((account) => account.role === "player");

  function confirmChange() {
    if (!pendingChange) return;
    const { account, makeAdmin } = pendingChange;
    startTransition(async () => {
      try {
        const result = await setAccountAdminRole(account.userId, makeAdmin);
        if (!result.success) {
          setMessage({ type: "error", text: result.error || "Não foi possível alterar o acesso." });
          return;
        }
        setPendingChange(null);
        setMessage({
          type: "success",
          text: makeAdmin
            ? `${account.player?.name || "A conta"} agora é ADM.`
            : `${account.player?.name || "A conta"} não possui mais acesso de ADM.`,
        });
        router.refresh();
      } catch {
        setMessage({ type: "error", text: "A conexão falhou. Atualize a página e tente novamente." });
      }
    });
  }

  return (
    <div className="space-y-6">
      <label className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-surface px-4">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pessoa cadastrada" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted sm:text-sm" />
      </label>

      {message && (
        <p role="status" className={`rounded-2xl border p-3 text-xs font-bold ${message.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
          {message.text}
        </p>
      )}

      <AccountGroup title="Administradores" subtitle="Acesso completo ao aplicativo" accounts={admins} currentUserId={currentUserId} onChange={setPendingChange} />
      <AccountGroup title="Pessoas com conta" subtitle="Podem ser promovidas a ADM" accounts={players} currentUserId={currentUserId} onChange={setPendingChange} />

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Nenhuma pessoa encontrada.</div>
      )}

      {pendingChange && (
        <div className="mobile-dialog-backdrop bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="admin-role-dialog-title" onMouseDown={(event) => event.target === event.currentTarget && !isPending && setPendingChange(null)}>
          <div className="mobile-dialog-panel max-w-md rounded-[26px] border border-border bg-surface p-5 shadow-2xl animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${pendingChange.makeAdmin ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"}`}>
                {pendingChange.makeAdmin ? <ShieldCheck className="h-6 w-6" /> : <ShieldX className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="admin-role-dialog-title" className="text-lg font-black text-foreground">{pendingChange.makeAdmin ? "Promover a ADM?" : "Remover acesso de ADM?"}</h2>
                <p className="mt-1 text-sm leading-5 text-muted">
                  {pendingChange.makeAdmin
                    ? `${pendingChange.account.player?.name || "Esta conta"} poderá gerenciar jogadores, rodadas, pagamentos, configurações e promover outros ADMs.`
                    : `${pendingChange.account.player?.name || "Esta conta"} perderá o acesso às funções administrativas.`}
                </p>
              </div>
              <button type="button" aria-label="Fechar" disabled={isPending} onClick={() => setPendingChange(null)} className="rounded-full p-2 text-muted hover:bg-background"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={isPending} onClick={() => setPendingChange(null)} className="h-12 rounded-xl border border-border text-sm font-black text-muted disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={isPending} onClick={confirmChange} className={`h-12 rounded-xl text-sm font-black disabled:opacity-50 ${pendingChange.makeAdmin ? "bg-accent text-background" : "bg-danger text-white"}`}>
                {isPending ? "Salvando..." : pendingChange.makeAdmin ? "Confirmar promoção" : "Remover acesso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountGroup({ title, subtitle, accounts, currentUserId, onChange }: {
  title: string;
  subtitle: string;
  accounts: ManagedAccount[];
  currentUserId: string;
  onChange: (change: NonNullable<PendingChange>) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div><h2 className="text-sm font-black text-foreground">{title}</h2><p className="mt-0.5 text-[10px] text-muted">{subtitle}</p></div>
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[9px] font-black text-muted">{accounts.length}</span>
      </div>
      <div className="space-y-2">
        {accounts.map((account) => {
          const isSelf = account.userId === currentUserId;
          const name = account.player?.name || "Conta sem jogador vinculado";
          return (
            <article key={account.userId} className="glass-card flex min-w-0 items-center gap-3 p-3.5">
              <PlayerAvatar name={name} avatarUrl={account.player?.avatarUrl} className="h-11 w-11 shrink-0 rounded-full border border-border bg-background text-xs font-black text-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-black text-foreground">{name}</p>
                  {isSelf && <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-accent">Você</span>}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted">{account.player?.nickname || (account.role === "admin" ? "Administrador" : "Conta cadastrada")}</p>
              </div>
              {account.role === "admin" ? (
                <button type="button" disabled={isSelf} onClick={() => onChange({ account, makeAdmin: false })} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-danger/30 px-3 text-[10px] font-black text-danger disabled:border-border disabled:text-muted disabled:opacity-50">
                  <ShieldX className="h-4 w-4" /><span className="hidden min-[390px]:inline">Remover</span>
                </button>
              ) : (
                <button type="button" onClick={() => onChange({ account, makeAdmin: true })} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-[10px] font-black text-background">
                  <Shield className="h-4 w-4" /> Tornar ADM
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
