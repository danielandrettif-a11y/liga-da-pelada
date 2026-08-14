import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRoleManager } from "@/components/AdminRoleManager";
import { ArrowLeft, ShieldCheck } from "@/components/icons";
import { getManagedAccounts } from "@/lib/actions/admins";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function AdminAdministradoresPage() {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !account.user) redirect("/");
  const accounts = await getManagedAccounts();

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link href="/mais" aria-label="Voltar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface hover:bg-surface-hover"><ArrowLeft className="h-5 w-5 text-muted" /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-xl font-black text-foreground">Administradores</h1><p className="mt-0.5 text-xs text-muted">Gerencie quem pode controlar o aplicativo</p></div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10"><ShieldCheck className="h-5 w-5 text-accent" /></div>
      </header>

      <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
        <p className="text-xs font-black text-warning">Acesso total</p>
        <p className="mt-1 text-[11px] leading-5 text-muted">Um ADM pode alterar rodadas, resultados, elenco, pagamentos, configurações e promover outras pessoas.</p>
      </div>

      <AdminRoleManager accounts={accounts} currentUserId={account.user.id} />
    </div>
  );
}
