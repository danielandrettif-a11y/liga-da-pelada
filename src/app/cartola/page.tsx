import Link from "next/link";
import { ClipboardList, LogIn, Trophy } from "@/components/icons";
import { FantasyExperience } from "@/components/fantasy/FantasyExperience";
import { getFantasyDashboard } from "@/lib/actions/fantasy";

export default async function CartolaPage() {
  const data = await getFantasyDashboard();
  if (!data.authenticated) return <Empty title="Entre para jogar o Cartola" description="Monte seu time, faça palpites e dispute com seus amigos." login />;
  if (!data.available) return <Empty title="Atualização do Cartola pendente" description="Execute as migrations do Cartola até a 039 para liberar a V1 desta temporada." />;
  return (
    <FantasyExperience
      round={data.round}
      fantasySeasonId={data.fantasySeasonId}
      status={data.fantasyRound.status}
      settings={data.settings}
      market={data.market}
      budget={data.budget}
      lineup={data.lineup}
      insights={data.insights}
      radar={data.radar}
      account={data.account}
      isTest={data.fantasyRound.isTest}
      lastRound={data.lastRound}
      challengeType={data.fantasyRound.challengeType}
    />
  );
}

function Empty({ title, description, login = false }: { title: string; description: string; login?: boolean }) {
  return <div className="space-y-5"><div className="flex items-center gap-2"><ClipboardList className="h-6 w-6 text-accent"/><h1 className="text-xl font-black text-foreground">Cartola</h1><span className="rounded-full bg-warning px-2 py-1 text-[8px] font-black uppercase tracking-wider text-background">Beta</span></div><section className="rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/15 to-surface p-8 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15"><Trophy className="h-8 w-8 text-accent"/></div><h2 className="mt-5 text-xl font-black text-foreground">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted">{description}</p>{login && <Link href="/login?next=/cartola" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-black text-background"><LogIn className="h-4 w-4"/>Entrar ou criar conta</Link>}</section></div>;
}
