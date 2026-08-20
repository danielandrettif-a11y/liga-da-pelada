import { redirect } from "next/navigation";
import Link from "next/link";
import { FantasyAdminSettings } from "@/components/fantasy/FantasyAdminSettings";
import { FantasyTestManager } from "@/components/fantasy/FantasyTestManager";
import { FantasyPackGiftManager } from "@/components/fantasy/FantasyPackGiftManager";
import { getFantasyAdminData } from "@/lib/actions/fantasy";
import { getManagedAccounts } from "@/lib/actions/admins";

export default async function FantasyAdminPage() {
  const [data, accounts] = await Promise.all([
    getFantasyAdminData(),
    getManagedAccounts(),
  ]);
  if (!data) redirect("/mais");

  return (
    <div className="space-y-5">
      <header>
        <Link href="/mais" className="text-xs font-bold text-accent">← Voltar</Link>
        <h1 className="mt-3 text-xl font-black text-foreground">Configurar Cartola</h1>
        <p className="mt-1 text-xs text-muted">Pontuação, economia, pacotes, cartas especiais e testes.</p>
      </header>

      <section className="rounded-3xl border border-warning/35 bg-[linear-gradient(145deg,rgba(245,158,11,0.12),rgba(2,24,14,0.92))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-warning">Pacote administrativo</p>
          <h2 className="mt-1 text-lg font-black text-foreground">Enviar para jogador selecionado</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">Escolha uma conta abaixo. Apenas ela receberá um novo pacote no inventário.</p>
        </div>
        <FantasyPackGiftManager accounts={accounts} />
      </section>

      <FantasyTestManager testSession={data.testSession} friendlyRounds={data.friendlyRounds} />
      <FantasyAdminSettings settings={data.settings} rounds={data.rounds} />
    </div>
  );
}
