import Link from "next/link";
import { TrendingUp } from "@/components/icons";

export function FantasyPlayerCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const prices = (summary.history || []).map((item: any) => Number(item.price_after));
  const min = Math.min(...prices, summary.price); const max = Math.max(...prices, summary.price); const span = Math.max(1, max - min);
  const points = prices.map((price: number, index: number) => `${prices.length <= 1 ? 0 : index * (100 / (prices.length - 1))},${38 - ((price - min) / span) * 32}`).join(" ");
  const variation = summary.history?.at(-1)?.variation_rate || 0;
  return <section><div className="mb-3 flex items-center gap-2 px-1"><TrendingUp className="h-4 w-4 text-accent"/><h3 className="text-xs font-black uppercase tracking-wider text-muted">No Cartola</h3></div><div className="glass-card overflow-hidden p-4"><div className="grid grid-cols-3 gap-3"><div><p className="text-[8px] font-black uppercase text-muted">Valor</p><p className="mt-1 text-lg font-black text-accent">C$ {summary.price.toFixed(2)}</p></div><div><p className="text-[8px] font-black uppercase text-muted">Variação</p><p className={`mt-1 text-lg font-black ${variation >= 0 ? "text-success" : "text-danger"}`}>{variation > 0 ? "+" : ""}{(variation * 100).toFixed(1)}%</p></div><div><p className="text-[8px] font-black uppercase text-muted">Média</p><p className="mt-1 text-lg font-black text-foreground">{summary.roundsPlayed ? (summary.totalPoints / summary.roundsPlayed).toFixed(1) : "0.0"}</p></div></div>{prices.length > 1 && <svg viewBox="0 0 100 42" className="mt-3 h-20 w-full" preserveAspectRatio="none" aria-label="Evolução do preço"><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>}<Link href="/cartola" className="mt-3 block text-center text-xs font-black text-accent">Abrir mercado →</Link></div></section>;
}
