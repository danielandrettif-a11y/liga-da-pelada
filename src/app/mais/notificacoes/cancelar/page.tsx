import Link from "next/link";
import { CancelCartolaEmailForm } from "@/components/CancelCartolaEmailForm";

export default async function CancelEmailPage({ searchParams }: PageProps<"/mais/notificacoes/cancelar">) {
  const params = await searchParams;
  const userId = typeof params.userId === "string" ? params.userId : "";
  const token = typeof params.token === "string" ? params.token : "";
  return <div className="mx-auto max-w-md space-y-5 pt-8"><CancelCartolaEmailForm userId={userId} token={token} /><Link href="/mais/notificacoes" className="block text-center text-xs font-bold text-accent">Abrir configurações de notificações</Link></div>;
}
