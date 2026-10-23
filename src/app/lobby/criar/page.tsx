import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "@/components/icons";
import { getCurrentAccount } from "@/lib/auth";
import { LeagueTierSelector } from "@/components/LeagueTierSelector";
import { QuickLeagueLauncher } from "@/components/QuickLeagueLauncher";
import { createLeague } from "../actions";

const choiceCardClass = "flex min-h-[270px] flex-col rounded-3xl border border-accent/35 bg-[linear-gradient(145deg,rgba(204,255,0,.12),rgba(4,34,18,.94)_58%,rgba(3,20,12,.98))] p-4 text-left shadow-[0_18px_45px_rgba(0,0,0,.24)] transition-transform active:scale-[.98]";

export default async function CreateLeaguePage({ searchParams }: {
  searchParams: Promise<{ error?: string; quickError?: string }>;
}) {
  const { user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  const { error, quickError } = await searchParams;
  return <div className="space-y-6 py-5">
    <Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link>
    <div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Nova pelada</p><h1 className="mt-2 font-athletic text-3xl font-black uppercase text-white">Escolha seu jeito de jogar</h1><p className="mt-2 text-sm leading-6 text-muted">Escolha uma pelada permanente para organizar seu grupo ou uma partida rápida para resolver apenas o jogo de hoje.</p></div>
    <div className="grid grid-cols-2 gap-3">
      <a href="#pelada-permanente" className={choiceCardClass} aria-label="Criar pelada permanente nos modos Básico ou Completo">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-background"><Trophy className="h-6 w-6" /></span>
        <span className="mt-4 block text-[9px] font-black uppercase tracking-[.16em] text-accent">Seu clube, sempre ativo</span>
        <strong className="mt-1 block font-athletic text-xl font-black uppercase leading-tight text-white">Pelada permanente</strong>
        <span className="mt-3 block text-[11px] leading-[1.55] text-muted">Escolha o modo Básico ou Completo, monte o elenco e acompanhe todas as temporadas.</span>
        <span className="mt-auto flex min-h-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-2 text-center text-[10px] font-black uppercase tracking-wide text-accent">Configurar pelada</span>
      </a>
      <QuickLeagueLauncher error={Boolean(quickError)} cardClassName={choiceCardClass} />
    </div>
    <div className="flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-muted">Configuração da pelada permanente</span><span className="h-px flex-1 bg-border" /></div>
    <form id="pelada-permanente" action={createLeague} className="scroll-mt-24 space-y-4 rounded-2xl border border-accent/30 bg-surface p-5">
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
