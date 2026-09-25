import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth";
import { createManagerClient, readCatalog, readManagerSave } from "@/lib/bq-manager/server";
import { ManagerExperience } from "@/components/bq-manager/ManagerExperience";

export const dynamic = "force-dynamic";
export const metadata = { title: "BQ Manager | Pelada BQ" };

export default async function ManagerPage() {
  const account = await getCurrentAccount();
  if (!account.user) return <Welcome login />;
  try {
    const client = createManagerClient();
    if (!client) return <Welcome />;
    const [save, catalogResult] = await Promise.all([
      readManagerSave(client, account.user.id),
      readCatalog(account.client).then(catalog => ({ catalog, failed: false })).catch(() => ({ catalog: [], failed: true })),
    ]);
    return <>
      {catalogResult.failed && <p role="status" className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">O catálogo BQ está temporariamente indisponível. Suas cartas continuam guardadas; novos pacotes aguardam a conexão.</p>}
      <ManagerExperience initialSave={save} catalog={catalogResult.catalog} />
    </>;
  } catch {
    return <Welcome unavailable />;
  }
}

function Welcome({ login = false, unavailable = false }: { login?: boolean; unavailable?: boolean }) {
  return <section className="rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 to-surface p-6">
    <p className="text-xs font-black tracking-widest text-accent">BQ MANAGER · PRIMEIRA FASE</p>
    <h1 className="mt-4 font-athletic text-4xl font-black">Seu clube.<br />A nossa pelada.</h1>
    <p className="mt-4 text-sm leading-7 text-muted">Uma carreira de técnico com cartas dos atletas BQ. Comece em Campos, evolua seu elenco e prepare seu caminho da Várzea à elite.</p>
    <p className="mt-4 text-sm leading-6 text-foreground">{login ? "Use sua conta do app para acessar a carreira." : unavailable ? "Não foi possível carregar sua carreira agora. Tente novamente em instantes." : "A carreira está em preparação. A demonstração de cartas, pacotes e fusões já pode ser testada."}</p>
    <div className="mt-6 flex flex-col gap-3">
      <Link href="/bq-manager/demo" className="rounded-xl bg-accent px-5 py-3 text-center text-sm font-black text-background">Experimentar demonstração</Link>
      {login && <Link href="/login?next=/bq-manager" className="rounded-xl border border-border px-5 py-3 text-center text-sm font-bold">Entrar com minha conta</Link>}
      {unavailable && <Link href="/bq-manager" prefetch={false} className="text-center text-sm text-accent">Tentar novamente</Link>}
    </div>
    <p className="mt-5 text-xs leading-5 text-muted">Demonstração com atletas fictícios e progresso temporário. Partidas e Várzea serão entregues nas próximas fases.</p>
  </section>;
}
