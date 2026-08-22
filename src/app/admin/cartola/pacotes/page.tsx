import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "@/components/icons";
import { FantasyPackGiftManager } from "@/components/fantasy/FantasyPackGiftManager";
import { FantasyPackAudit } from "@/components/fantasy/FantasyPackAudit";
import { getManagedAccounts } from "@/lib/actions/admins";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function FantasyAdminPacksPage() {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) redirect("/");
  const accounts = await getManagedAccounts();

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link href="/mais" aria-label="Voltar" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface"><ArrowLeft className="h-5 w-5 text-muted" /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-xl font-black text-foreground">Enviar pacote</h1><p className="text-xs text-muted">Escolha quem receberá um novo pacote do Cartola</p></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15"><Sparkles className="h-5 w-5 text-accent" /></span>
      </header>
      <section className="rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 to-surface p-4"><FantasyPackGiftManager accounts={accounts} /></section>
      <FantasyPackAudit />
    </div>
  );
}
