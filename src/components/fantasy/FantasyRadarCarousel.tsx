"use client";

import { useEffect, useRef, useState } from "react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type { FantasyMarketPlayer, FantasyRadarData, FantasyRadarHighlight, FantasyRadarTopList } from "@/lib/actions/fantasy";

type Props = { radar: FantasyRadarData; onSelectPlayer?: (player: FantasyMarketPlayer) => void };
type HighlightStory = { id: string; kind: "highlight"; title: string; eyebrow: string; highlight: FantasyRadarHighlight; tone: Tone };
type ListStory = { id: string; kind: "list"; list: FantasyRadarTopList; tone: Tone };
type ComparisonStory = { id: string; kind: "comparison"; tone: Tone };
type WithdrawalStory = { id: string; kind: "withdrawal"; tone: Tone };
type Story = HighlightStory | ListStory | ComparisonStory | WithdrawalStory;
type Tone = "accent" | "warning" | "success" | "danger";

const toneClasses: Record<Tone, string> = {
  accent: "border-accent/40 bg-accent/[0.08] text-accent",
  warning: "border-warning/40 bg-warning/[0.08] text-warning",
  success: "border-success/40 bg-success/[0.08] text-success",
  danger: "border-danger/40 bg-danger/[0.08] text-danger",
};

function PlayerLine({ highlight, onSelectPlayer, rank }: { highlight: FantasyRadarHighlight; onSelectPlayer?: Props["onSelectPlayer"]; rank?: number }) {
  const { player, value, extra } = highlight;
  return <button type="button" onClick={() => onSelectPlayer?.(player)} className="flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.99]">
    {rank ? <span className="w-3 text-[10px] font-black text-muted">{rank}</span> : null}
    <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} clickable={false} className="h-8 w-8 shrink-0 rounded-full border border-border bg-background text-[9px] font-black text-accent" />
    <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-foreground">{player.name}</span><span className="block truncate text-[9px] font-bold text-muted">{extra || `C$ ${player.price.toFixed(2)}`}</span></span>
    <span className="shrink-0 text-xs font-black text-foreground">{value}</span>
  </button>;
}

export function FantasyRadarCarousel({ radar, onSelectPlayer }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pausedUntil = useRef(0);
  const startX = useRef<number | null>(null);
  const stories: Story[] = [
    radar.topLists.mostSelected ? { id: "top-selected", kind: "list", list: radar.topLists.mostSelected, tone: "accent" } : null,
    radar.topLists.favoriteScorers ? { id: "top-scorers", kind: "list", list: radar.topLists.favoriteScorers, tone: "warning" } : null,
    radar.topLists.goalkeepers ? { id: "top-goalkeepers", kind: "list", list: radar.topLists.goalkeepers, tone: "success" } : null,
    radar.mostCaptained ? { id: "captains", kind: "highlight", title: "Capitão da massa", eyebrow: "Braçadeira mais confiada", highlight: radar.mostCaptained, tone: "warning" } : null,
    radar.bestForm ? { id: "form", kind: "highlight", title: "Em alta", eyebrow: "Forma recente", highlight: radar.bestForm, tone: "success" } : null,
    radar.topValuation ? { id: "valuation", kind: "highlight", title: "Valorização", eyebrow: "Quem está rendendo caixa", highlight: radar.topValuation, tone: "accent" } : null,
    radar.mostBought ? { id: "bought", kind: "highlight", title: "Mercado agitado", eyebrow: "Mais comprado", highlight: radar.mostBought, tone: "success" } : null,
    radar.mostSold ? { id: "sold", kind: "highlight", title: "Mercado agitado", eyebrow: "Mais vendido", highlight: radar.mostSold, tone: "danger" } : null,
    radar.comparison ? { id: "comparison", kind: "comparison", tone: "warning" } : null,
    radar.latestWithdrawal ? { id: `withdrawal-${radar.latestWithdrawal.id}`, kind: "withdrawal", tone: "danger" } : null,
  ].filter(Boolean) as Story[];

  useEffect(() => setActiveIndex((current) => Math.min(current, Math.max(0, stories.length - 1))), [stories.length]);
  useEffect(() => {
    if (stories.length < 2) return;
    const interval = window.setInterval(() => {
      if (Date.now() >= pausedUntil.current) setActiveIndex((current) => (current + 1) % stories.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [stories.length]);
  if (stories.length === 0) return null;

  const pause = () => { pausedUntil.current = Date.now() + 9000; };
  const goTo = (index: number) => { pause(); setActiveIndex((index + stories.length) % stories.length); };

  return <section className="space-y-2.5" aria-label="Radar Cartola">
    <div className="flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/20 text-xs">📡</span><div><h2 className="text-xs font-black uppercase tracking-wider text-foreground">Radar Cartola</h2><p className="text-[9px] font-bold text-muted">Mercado vivo · deslize para explorar</p></div></div><div className="flex gap-1" aria-label="Navegação do Radar">{stories.map((story, index) => <button key={story.id} type="button" aria-label={`Ir para notícia ${index + 1}`} onClick={() => goTo(index)} className={`h-1.5 rounded-full transition-all ${activeIndex === index ? "w-4 bg-accent" : "w-1.5 bg-border"}`} />)}</div></div>
    <div className="overflow-hidden rounded-2xl" onPointerDown={(event) => { pause(); startX.current = event.clientX; }} onPointerUp={(event) => { if (startX.current === null) return; const distance = event.clientX - startX.current; startX.current = null; if (Math.abs(distance) > 32) goTo(activeIndex + (distance < 0 ? 1 : -1)); }} onPointerCancel={() => { startX.current = null; }}>
      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
        {stories.map((story) => <article key={story.id} className={`w-full shrink-0 rounded-2xl border p-3.5 ${toneClasses[story.tone]}`}>
          {story.kind === "list" && <><p className="text-[9px] font-black uppercase tracking-[0.16em] opacity-80">Radar do mercado</p><h3 className="mt-1 text-sm font-black text-foreground">{story.list.title}</h3><p className="mb-2 text-[10px] font-bold text-muted">{story.list.subtitle}</p><div className="divide-y divide-white/[0.06]">{story.list.players.map((highlight, index) => <PlayerLine key={highlight.player.id} highlight={highlight} rank={index + 1} onSelectPlayer={onSelectPlayer} />)}</div></>}
          {story.kind === "highlight" && <><p className="text-[9px] font-black uppercase tracking-[0.16em] opacity-80">{story.eyebrow}</p><h3 className="mt-1 text-sm font-black text-foreground">{story.title}</h3><div className="mt-2"><PlayerLine highlight={story.highlight} onSelectPlayer={onSelectPlayer} /></div><p className="mt-1 text-[10px] font-bold text-muted">Dados reais do mercado; o hype fica por conta da arquibancada.</p></>}
          {story.kind === "comparison" && radar.comparison && <><p className="text-[9px] font-black uppercase tracking-[0.16em] opacity-80">Duelo de radar · {radar.comparison.metric}</p><h3 className="mt-1 text-sm font-black text-foreground">Quem chega mais quente?</h3><div className="mt-2 grid grid-cols-2 gap-2"><PlayerLine highlight={radar.comparison.leader} onSelectPlayer={onSelectPlayer} /><PlayerLine highlight={radar.comparison.challenger} onSelectPlayer={onSelectPlayer} /></div><p className="mt-2 text-[10px] font-bold leading-4 text-muted">{radar.comparison.copy}</p></>}
          {story.kind === "withdrawal" && radar.latestWithdrawal && <><p className="text-[9px] font-black uppercase tracking-[0.16em]">Notícia de convocação</p><h3 className="mt-1 text-sm font-black text-foreground">🚨 Desfalque confirmado</h3><p className="mt-2 text-xs font-bold leading-5 text-foreground"><span className="text-danger">{radar.latestWithdrawal.playerName}</span> saiu da convocação.</p>{radar.latestWithdrawal.player ? <PlayerLine highlight={{ player: radar.latestWithdrawal.player, value: "Ver ficha", extra: "toque para abrir o atleta" }} onSelectPlayer={onSelectPlayer} /> : null}<p className="mt-1 text-[10px] font-bold text-muted">Quem escalou o atleta recebeu um aviso na Inbox. Revise o Cartola antes de salvar.</p></>}
        </article>)}
      </div>
    </div>
  </section>;
}
