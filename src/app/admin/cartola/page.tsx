import { redirect } from "next/navigation";
import Link from "next/link";
import { FantasyAdminSettings } from "@/components/fantasy/FantasyAdminSettings";
import { FantasyTestManager } from "@/components/fantasy/FantasyTestManager";
import { getFantasyAdminData } from "@/lib/actions/fantasy";

export default async function FantasyAdminPage() {
  const data = await getFantasyAdminData();
  if (!data) redirect("/mais");

  return (
    <div className="space-y-5">
      <header>
        <Link href="/mais" className="text-xs font-bold text-accent">← Voltar</Link>
        <h1 className="mt-3 text-xl font-black text-foreground">Configurar Cartola</h1>
        <p className="mt-1 text-xs text-muted">Pontuação, economia, pacotes, cartas especiais e testes.</p>
      </header>

      <Link href="/admin/cartola/pacotes" className="flex items-center justify-between rounded-2xl border border-warning/35 bg-warning/10 p-4 transition-colors hover:bg-warning/15">
        <span><span className="block text-[10px] font-black uppercase tracking-[0.2em] text-warning">Pacotes</span><span className="mt-1 block text-sm font-black text-foreground">Enviar e auditar pacotes</span></span>
        <span className="text-sm font-black text-warning">Abrir →</span>
      </Link>

      <FantasyTestManager testSession={data.testSession} friendlyRounds={data.friendlyRounds} />
      <FantasyAdminSettings settings={data.settings} rounds={data.rounds} />
    </div>
  );
}
