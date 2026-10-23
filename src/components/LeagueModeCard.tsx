import { getSelectedLeague } from "@/lib/league-context";
import { upgradeCurrentLeague } from "@/app/mais/league-mode-actions";

export async function LeagueModeCard() {
  const league = await getSelectedLeague();
  if (!league) return null;
  return <section className="rounded-2xl border border-accent/25 bg-surface p-4">
    <p className="text-xs font-black uppercase tracking-widest text-accent">Tipo da pelada</p>
    <h2 className="mt-1 font-athletic text-xl font-black text-white">{league.featureTier === "quick" ? "Descartável" : league.featureTier === "basic" ? "Básica" : "Completa"}</h2>
    <p className="mt-2 text-xs text-muted">{league.featureTier === "quick"
      ? "Sessão privada, só com convidados. Sem ranking: placar ao vivo, histórico e pagamentos continuam disponíveis."
      : league.featureTier === "basic"
      ? "Elenco, convocação, partidas e ranking. O histórico fica guardado no upgrade."
      : "Ranking, Cartola, cosméticos e demais recursos liberados."}</p>
    {league.featureTier === "basic" && league.role === "admin" && <form action={upgradeCurrentLeague} className="mt-4">
      <input type="hidden" name="confirm" value="upgrade" />
      <button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Liberar versão completa</button>
      <p className="mt-2 text-[11px] text-muted">Upgrade permanente; não apaga as partidas nem o ranking.</p>
    </form>}
  </section>;
}
