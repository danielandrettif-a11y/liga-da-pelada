import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { PaymentRecipientsManager } from "@/components/PaymentRecipientsManager";
import { getPaymentRecipients } from "@/lib/actions/payments";
import { getCurrentAccount } from "@/lib/auth";
export default async function PixRecipientsPage(){const account=await getCurrentAccount();if(!account.isAdmin)redirect("/mais");const recipients=await getPaymentRecipients(true);return <div className="space-y-5"><header className="flex items-center gap-3"><Link href="/mais" className="rounded-full bg-surface p-2"><ArrowLeft className="h-5 w-5 text-muted"/></Link><div><h1 className="text-xl font-black text-foreground">PIX de recebimento</h1><p className="text-xs text-muted">Escolha estes destinatários ao encerrar a rodada.</p></div></header><PaymentRecipientsManager recipients={recipients}/></div>}
