import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getMyLeagues } from "@/lib/league-context";
import { createLeague } from "../actions";

export default async function CreateLeaguePage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  const canCreate = (await getMyLeagues()).some((league) => league.role === "admin");
  const enabled = process.env.MULTI_LEAGUE_CREATION_ENABLED === "true";
  const { error } = await searchParams;
  return <div className="space-y-6 py-5">
    <Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link>
    <div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Nova pelada</p><h1 className="mt-2 font-athletic text-3xl font-black uppercase text-white">Escolha seu jeito de jogar</h1><p className="mt-2 text-sm leading-6 text-muted">Uma pelada nova começa sem histórico, com temporada própria. Por enquanto, só administradores podem criá-la.</p></div>
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-surface p-5"><span className="text-xs font-black uppercase text-accent">Básica</span><h2 className="mt-2 text-xl font-black text-white">Organização e ranking</h2><p className="mt-2 text-sm leading-6 text-muted">Elenco, convocações, rodadas, scouts e classificação. Pode ser ampliada para Completa depois.</p></section>
      <section className="rounded-2xl border border-accent/30 bg-accent/5 p-5"><span className="text-xs font-black uppercase text-accent">Completa</span><h2 className="mt-2 text-xl font-black text-white">A experiência toda</h2><p className="mt-2 text-sm leading-6 text-muted">Tudo da Básica, mais Cartola, cosméticos e recursos extras da pelada.</p></section>
    </div>
    {!canCreate ? <p role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">Somente quem já administra uma pelada pode criar outra por enquanto.</p>
      : !enabled ? <p role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">Criação temporariamente indisponível. Ela será liberada após aplicar as migrations e testar o isolamento com duas peladas.</p>
        : <form action={createLeague} className="space-y-4 rounded-2xl border border-accent/30 bg-surface p-5">
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
              <option value="private">Privada — somente por convite ou ADM</option>
              <option value="open">Aberta — aparece na busca</option>
            </select>
          </label>
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">Não foi possível criar a pelada. Confira os dados e tente novamente.</p>}
          <button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Criar pelada</button>
        </form>}
  </div>;
}
