import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { ExpenseItemsManager } from "@/components/ExpenseItemsManager";
import { getExpenseItems, getPaymentRecipients } from "@/lib/actions/payments";
import { getCurrentAccount } from "@/lib/auth";

export default async function ExpenseItemsPage() {
  const account = await getCurrentAccount(); if (!account.isAdmin) redirect("/mais");
  const [items, recipients] = await Promise.all([getExpenseItems(true), getPaymentRecipients(true)]);
  return <div className="space-y-5"><header className="flex items-center gap-3"><Link href="/mais?aba=admin" className="rounded-full bg-surface p-2"><ArrowLeft className="h-5 w-5 text-muted" /></Link><div><h1 className="text-xl font-black text-foreground">Caixinha e despesas</h1><p className="text-xs text-muted">Compras parceladas e rateadas por rodada</p></div></header>{recipients.some((item) => item.is_active) ? <ExpenseItemsManager items={items} recipients={recipients} /> : <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 text-sm text-muted">Cadastre primeiro um <Link href="/mais/pix" className="font-bold text-accent">PIX de recebimento</Link>.</div>}</div>;
}
