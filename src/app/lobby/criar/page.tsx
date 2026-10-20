import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { createLeague } from "../actions";

export default async function CreateLeaguePage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  const { error } = await searchParams;
  return <div className="space-y-6 py-5">
    <Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link>
    <div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Nova pelada</p><h1 className="mt-2 font-athletic text-3xl font-black uppercase text-white">Escolha seu jeito de jogar</h1><p className="mt-2 text-sm leading-6 text-muted">Crie sua própria pelada do zero. Você será o administrador e poderá convidar jogadores, abrir convocações e configurar as regras.</p></div>
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-surface p-5"><span className="text-xs font-black uppercase text-accent">Básica</span><h2 className="mt-2 text-xl font-black text-white">Organização e ranking</h2><p className="mt-2 text-sm leading-6 text-muted">Elenco, convocações, rodadas, scouts e classificação. Pode ser ampliada para Completa depois.</p></section>
      <section className="rounded-2xl border border-accent/30 bg-accent/5 p-5"><span className="text-xs font-black uppercase text-accent">Completa</span><h2 className="mt-2 text-xl font-black text-white">A experiência toda</h2><p className="mt-2 text-sm leading-6 text-muted">Tudo da Básica, mais Cartola, cosméticos e recursos extras da pelada.</p></section>
    </div>
    <form action={createLeague} className="space-y-4 rounded-2xl border border-accent/30 bg-surface p-5">
          <label className="block text-sm font-bold text-white">Nome da pelada
            <input name="name" required minLength={3} maxLength={80} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-white" placeholder="Ex.: Pelada HG" />
          </label>
          <label className="block text-sm font-bold text-white">Modo
            <select name="tier" defaultValue="basic" className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-white">
              <option value="basic">Básica</option><option value="complete">Completa</option>
            </select>
          </label>
          <label className="block text-sm font-bold text-white">Acesso
            <select name="visibility" defaultValue="private" className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-white">
              <option value="private">Fechada — jogadores solicitam entrada</option>
              <option value="open">Aberta — qualquer jogador pode entrar</option>
            </select>
          </label>
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-pretty text-sm text-red-200">
            {error === "duplicate" ? "Já existe uma pelada com esse nome. Escolha um nome diferente." : "Não foi possível criar a pelada. Confira os dados e tente novamente."}
          </p>}
          <button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Criar minha pelada</button>
        </form>
  </div>;
}
