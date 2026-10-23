import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { LeagueTierSelector } from "@/components/LeagueTierSelector";
import { QuickLeagueLauncher } from "@/components/QuickLeagueLauncher";
import { createLeague } from "../actions";

export default async function CreateLeaguePage({ searchParams }: {
  searchParams: Promise<{ error?: string; quickError?: string }>;
}) {
  const { user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  const { error, quickError } = await searchParams;
  return <div className="space-y-6 py-5">
    <Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link>
    <div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Nova pelada</p><h1 className="mt-2 font-athletic text-3xl font-black uppercase text-white">Escolha seu jeito de jogar</h1><p className="mt-2 text-sm leading-6 text-muted">Crie sua própria pelada do zero. Você será o administrador e poderá convidar jogadores, abrir convocações e configurar as regras.</p></div>
    <QuickLeagueLauncher error={Boolean(quickError)} />
    <div className="flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-muted">ou crie uma pelada permanente</span><span className="h-px flex-1 bg-border" /></div>
    <form action={createLeague} className="space-y-4 rounded-2xl border border-accent/30 bg-surface p-5">
          <label className="block text-sm font-bold text-white">Nome da pelada
            <input name="name" required minLength={3} maxLength={80} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-white" placeholder="Ex.: Pelada HG" />
          </label>
          <LeagueTierSelector />
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-pretty text-sm text-red-200">
            {error === "duplicate" ? "Já existe uma pelada com esse nome. Escolha um nome diferente." : "Não foi possível criar a pelada. Confira os dados e tente novamente."}
          </p>}
          <button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Criar minha pelada</button>
        </form>
  </div>;
}
