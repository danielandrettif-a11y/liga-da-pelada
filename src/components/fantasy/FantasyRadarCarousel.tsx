"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type {
  FantasyMarketPlayer,
  FantasyRadarData,
  FantasyRadarHighlight,
  FantasyRadarTopList,
} from "@/lib/actions/fantasy";

type Props = {
  radar: FantasyRadarData;
  onSelectPlayer?: (player: FantasyMarketPlayer) => void;
};

type Tone = "accent" | "warning" | "success" | "danger";
type Story =
  | { id: string; kind: "list"; list: FantasyRadarTopList; tone: Tone }
  | { id: string; kind: "highlight"; eyebrow: string; title: string; highlight: FantasyRadarHighlight; tone: Tone }
  | { id: string; kind: "comparison"; tone: Tone }
  | { id: string; kind: "withdrawal"; tone: Tone };

const toneClasses: Record<Tone, string> = {
  accent: "border-accent/35 bg-gradient-to-r from-accent/[.13] to-surface",
  warning: "border-warning/35 bg-gradient-to-r from-warning/[.13] to-surface",
  success: "border-success/35 bg-gradient-to-r from-success/[.13] to-surface",
  danger: "border-danger/35 bg-gradient-to-r from-danger/[.13] to-surface",
};

function CompactPlayer({
  highlight,
  rank,
  onSelectPlayer,
}: {
  highlight: FantasyRadarHighlight;
  rank?: number;
  onSelectPlayer?: Props["onSelectPlayer"];
}) {
  const { player, value, extra } = highlight;
  return (
    <button
      type="button"
      onClick={() => onSelectPlayer?.(player)}
      className="flex w-full min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 text-left active:bg-white/[.06]"
    >
      {rank ? <span className="w-3 shrink-0 text-[9px] font-black text-muted">{rank}</span> : null}
      <PlayerAvatar
        name={player.name}
        avatarUrl={player.avatarUrl}
        clickable={false}
        className="h-7 w-7 shrink-0 rounded-full border border-white/10 bg-background text-[8px] font-black text-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-black text-foreground">{player.name}</span>
        <span className="block truncate text-[8px] font-bold text-muted">{extra}</span>
      </span>
      <strong className="shrink-0 text-[10px] text-foreground">{value}</strong>
    </button>
  );
}

export function FantasyRadarCarousel({ radar, onSelectPlayer }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const interactingRef = useRef(false);
  const lastFrameRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);

  const stories: Story[] = [
    radar.latestWithdrawal
      ? { id: `withdrawal-${radar.latestWithdrawal.id}`, kind: "withdrawal", tone: "danger" }
      : null,
    radar.topLists.mostSelected
      ? { id: "top-selected", kind: "list", list: radar.topLists.mostSelected, tone: "accent" }
      : null,
    radar.topLists.favoriteScorers
      ? { id: "top-scorers", kind: "list", list: radar.topLists.favoriteScorers, tone: "warning" }
      : null,
    radar.topLists.goalkeepers
      ? { id: "top-goalkeepers", kind: "list", list: radar.topLists.goalkeepers, tone: "success" }
      : null,
    radar.mostCaptained
      ? {
          id: "captains",
          kind: "highlight",
          eyebrow: "Capitão da massa",
          title: "Braçadeira mais confiada",
          highlight: radar.mostCaptained,
          tone: "warning",
        }
      : null,
    radar.bestForm
      ? { id: "form", kind: "highlight", eyebrow: "Em alta", title: "Melhor forma recente", highlight: radar.bestForm, tone: "success" }
      : null,
    radar.topValuation
      ? { id: "valuation", kind: "highlight", eyebrow: "Valorização", title: "Quem está rendendo caixa", highlight: radar.topValuation, tone: "accent" }
      : null,
    radar.mostBought
      ? { id: "bought", kind: "highlight", eyebrow: "Mercado agitado", title: "Mais comprado", highlight: radar.mostBought, tone: "success" }
      : null,
    radar.mostSold
      ? { id: "sold", kind: "highlight", eyebrow: "Mercado agitado", title: "Mais vendido", highlight: radar.mostSold, tone: "danger" }
      : null,
    radar.comparison ? { id: "comparison", kind: "comparison", tone: "warning" } : null,
  ].filter(Boolean) as Story[];

  useEffect(() => {
    const track = trackRef.current;
    if (!track || stories.length < 2) return;

    const prepareLoop = () => {
      if (!initializedRef.current && track.scrollWidth > 0) {
        track.scrollLeft = track.scrollWidth / 3;
        initializedRef.current = true;
      }
    };
    prepareLoop();

    let frameId = 0;
    const move = (timestamp: number) => {
      const previous = lastFrameRef.current ?? timestamp;
      const elapsed = Math.min(timestamp - previous, 40);
      lastFrameRef.current = timestamp;

      if (!interactingRef.current && !expandedStoryId) {
        const sectionWidth = track.scrollWidth / 3;
        if (sectionWidth > 0) {
          track.scrollLeft += elapsed * 0.022;
          if (track.scrollLeft >= sectionWidth * 2) track.scrollLeft -= sectionWidth;
          if (track.scrollLeft <= 0) track.scrollLeft += sectionWidth;
        }
      }
      frameId = window.requestAnimationFrame(move);
    };

    frameId = window.requestAnimationFrame(move);
    return () => {
      window.cancelAnimationFrame(frameId);
      lastFrameRef.current = null;
    };
  }, [expandedStoryId, stories.length]);

  if (stories.length === 0) return null;

  const repeatedStories = [...stories, ...stories, ...stories];
  const releaseInteraction = () => {
    interactingRef.current = false;
    lastFrameRef.current = null;
  };

  return (
    <section aria-label="Radar Cartola" className="overflow-hidden rounded-2xl border border-accent/20 bg-black/20 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.2)]">
      <div className="mb-2 flex items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-[11px]">📡</span>
          <div className="min-w-0">
            <h2 className="truncate text-[10px] font-black uppercase tracking-[.14em] text-foreground">Radar Cartola</h2>
            <p className="truncate text-[8px] font-bold text-muted">Notícias, tendências e resenha do mercado</p>
          </div>
        </div>
        <span className="shrink-0 text-[8px] font-bold text-muted">Segure e arraste</span>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex touch-pan-x select-none gap-2 overflow-x-auto px-3"
        onPointerDown={() => {
          interactingRef.current = true;
        }}
        onPointerUp={releaseInteraction}
        onPointerCancel={releaseInteraction}
        onPointerLeave={releaseInteraction}
        onTouchEnd={releaseInteraction}
      >
        {repeatedStories.map((story, repeatedIndex) => {
          const expanded = expandedStoryId === story.id;
          return (
            <article
              key={`${repeatedIndex}-${story.id}`}
              className={`w-[78vw] max-w-[300px] shrink-0 rounded-xl border px-2.5 py-2 transition-[height] ${toneClasses[story.tone]}`}
            >
              {story.kind === "list" ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setExpandedStoryId(expanded ? null : story.id)}
                    aria-expanded={expanded}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[8px] font-black uppercase tracking-[.14em] text-accent">Top 3 do Radar</span>
                      <strong className="block truncate text-[11px] text-foreground">{story.list.title}</strong>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[.06] px-2 py-1 text-[8px] font-black text-muted">
                      {expanded ? "Recolher" : "Abrir"}
                      <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  <div className={`mt-1 divide-y divide-white/[.06] ${expanded ? "" : "max-h-9 overflow-hidden"}`}>
                    {story.list.players.slice(0, expanded ? 3 : 1).map((highlight, index) => (
                      <CompactPlayer key={highlight.player.id} highlight={highlight} rank={index + 1} onSelectPlayer={onSelectPlayer} />
                    ))}
                  </div>
                  {expanded ? <p className="mt-1 px-1 text-[8px] font-bold text-muted">{story.list.subtitle}</p> : null}
                </>
              ) : null}

              {story.kind === "highlight" ? (
                <>
                  <p className="truncate text-[8px] font-black uppercase tracking-[.14em] text-accent">{story.eyebrow}</p>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-[11px] text-foreground">{story.title}</strong>
                    <span className="shrink-0 text-[8px] font-bold text-muted">Dados reais</span>
                  </div>
                  <CompactPlayer highlight={story.highlight} onSelectPlayer={onSelectPlayer} />
                </>
              ) : null}

              {story.kind === "comparison" && radar.comparison ? (
                <>
                  <p className="text-[8px] font-black uppercase tracking-[.14em] text-warning">Duelo · {radar.comparison.metric}</p>
                  <p className="truncate text-[11px] font-black text-foreground">{radar.comparison.leader.player.name} × {radar.comparison.challenger.player.name}</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] font-black text-muted">
                    <button type="button" onClick={() => onSelectPlayer?.(radar.comparison!.leader.player)} className="truncate rounded-lg bg-black/20 px-2 py-1 text-left">{radar.comparison.leader.value}</button>
                    <button type="button" onClick={() => onSelectPlayer?.(radar.comparison!.challenger.player)} className="truncate rounded-lg bg-black/20 px-2 py-1 text-left">{radar.comparison.challenger.value}</button>
                  </div>
                </>
              ) : null}

              {story.kind === "withdrawal" && radar.latestWithdrawal ? (
                <>
                  <p className="text-[8px] font-black uppercase tracking-[.14em] text-danger">🚨 Desfalque confirmado</p>
                  <p className="mt-1 truncate text-[11px] font-black text-foreground">{radar.latestWithdrawal.playerName} saiu da convocação</p>
                  <button
                    type="button"
                    disabled={!radar.latestWithdrawal.player}
                    onClick={() => radar.latestWithdrawal?.player && onSelectPlayer?.(radar.latestWithdrawal.player)}
                    className="mt-1 text-[8px] font-bold text-muted disabled:pointer-events-none"
                  >
                    {radar.latestWithdrawal.player ? "Toque para abrir a ficha →" : "Revise sua escalação no Cartola"}
                  </button>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
