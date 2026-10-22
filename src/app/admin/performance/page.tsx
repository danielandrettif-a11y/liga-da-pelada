import { AlertTriangle, Radio } from "@/components/icons";
import { getPerformanceSummary } from "@/lib/actions/performance";

export const revalidate = 0;

function metricStatus(row: { p95_ms: number | null; poor_or_failed: number }) {
  if (row.poor_or_failed > 0 || Number(row.p95_ms || 0) >= 1_500) return "danger";
  if (Number(row.p95_ms || 0) >= 750) return "warning";
  return "healthy";
}

export default async function AdminPerformancePage() {
  const rows = await getPerformanceSummary(24);
  return <div className="space-y-5">
    <header>
      <div className="flex items-center gap-2"><Radio className="h-5 w-5 text-accent" /><h1 className="text-xl font-black text-foreground">Performance real</h1></div>
      <p className="mt-1 text-xs text-muted">p50 e p95 das últimas 24 horas · retenção de 30 dias</p>
    </header>
    {rows.length === 0 ? <div className="glass-card p-7 text-center"><p className="font-black text-foreground">Aguardando amostras</p><p className="mt-2 text-xs text-muted">As métricas aparecem após o novo deploy receber acessos.</p></div> : <div className="space-y-3">
      {rows.map((row) => {
        const status = metricStatus(row);
        return <article key={`${row.kind}-${row.name}-${row.path}`} className={`glass-card p-4 ${status === "danger" ? "border-danger/45" : status === "warning" ? "border-warning/40" : "border-accent/20"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-wider text-accent">{row.kind}</p><h2 className="truncate text-sm font-black text-foreground">{row.name}</h2><p className="truncate text-[10px] text-muted">{row.path || "servidor"}</p></div>{status !== "healthy" && <AlertTriangle className={`h-5 w-5 ${status === "danger" ? "text-danger" : "text-warning"}`} />}</div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center"><div><p className="text-[9px] uppercase text-muted">Amostras</p><strong className="text-sm text-foreground">{row.samples}</strong></div><div><p className="text-[9px] uppercase text-muted">p50</p><strong className="text-sm text-foreground">{row.p50_ms ?? "—"} ms</strong></div><div><p className="text-[9px] uppercase text-muted">p95</p><strong className="text-sm text-accent">{row.p95_ms ?? "—"} ms</strong></div><div><p className="text-[9px] uppercase text-muted">Pior</p><strong className="text-sm text-foreground">{row.max_ms ?? "—"} ms</strong></div></div>
        </article>;
      })}
    </div>}
  </div>;
}
