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
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const interactingRef = useRef(false);
  const lastFrameRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  const stories: Story[] = [
    radar.latestWithdrawal
      ? { id: `withdrawal-${radar.latestWithdrawal.id}`, kind: "withdrawal", tone: "danger" }
      : null,
    radar.topLists.mostSelected
      ? { id: "top-selected", kind: "list", list: radar.topLists.mostSelected, tone: "accent" }
      : null,
    radar.topLists.mostCaptained
      ? { id: "top-captains", kind: "list", list: radar.topLists.mostCaptained, tone: "warning" }
      : null,
    radar.topLists.favoriteScorers
      ? { id: "top-scorers", kind: "list", list: radar.topLists.favoriteScorers, tone: "warning" }
      : null,
    radar.topLists.favoriteAssists
      ? { id: "top-assists", kind: "list", list: radar.topLists.favoriteAssists, tone: "accent" }
      : null,
    radar.topLists.goalkeepers
      ? { id: "top-goalkeepers", kind: "list", list: radar.topLists.goalkeepers, tone: "success" }
      : null,
    radar.topLists.topValuation
      ? { id: "top-valuation", kind: "list", list: radar.topLists.topValuation, tone: "success" }
      : null,
    radar.topLists.topDepreciation
      ? { id: "top-depreciation", kind: "list", list: radar.topLists.topDepreciation, tone: "danger" }
      : null,
    radar.topLists.bestCostBenefit
      ? { id: "top-cost-benefit", kind: "list", list: radar.topLists.bestCostBenefit, tone: "accent" }
      : null,
    radar.topLists.bestForm
      ? { id: "top-form", kind: "list", list: radar.topLists.bestForm, tone: "success" }
      : null,
    radar.topLists.mostBought
      ? { id: "top-bought", kind: "list", list: radar.topLists.mostBought, tone: "success" }
      : null,
    radar.topLists.mostSold
      ? { id: "top-sold", kind: "list", list: radar.topLists.mostSold, tone: "danger" }
      : null,
  ].filter(Boolean) as Story[];

  const storySignature = stories.map((story) => story.id).join("|");

  useEffect(() => {
    const track = trackRef.current;
    if (!track || stories.length < 2) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameId = 0;

    const sectionWidth = () => track.scrollWidth / 3;
    const prepareLoop = () => {
      const width = sectionWidth();
      if (!initializedRef.current && width > 0) {
        track.scrollLeft = width;
        initializedRef.current = true;
      }
    };
    prepareLoop();

    const move = (timestamp: number) => {
      const previous = lastFrameRef.current ?? timestamp;
      const elapsed = Math.min(timestamp - previous, 40);
      lastFrameRef.current = timestamp;

      if (!prefersReducedMotion && !interactingRef.current && !expandedStoryId) {
        const width = sectionWidth();
        if (width > 0 && track.scrollWidth > track.clientWidth) {
          // Velocidade intencionalmente perceptível, mas sem competir com o gesto manual.
          track.scrollLeft += elapsed * 0.04;
          if (track.scrollLeft >= width * 2) track.scrollLeft -= width;
          if (track.scrollLeft <= 0) track.scrollLeft += width;
        }
      }
      frameId = window.requestAnimationFrame(move);
    };

    const observer = new ResizeObserver(prepareLoop);
    observer.observe(track);
    frameId = window.requestAnimationFrame(move);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      lastFrameRef.current = null;
      initializedRef.current = false;
    };
  }, [expandedStoryId, storySignature, stories.length]);

  if (stories.length === 0) return null;

  const repeatedStories = [...stories, ...stories, ...stories];
  const beginInteraction = () => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    interactingRef.current = true;
  };
  const releaseInteraction = () => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    // Aguarda o fim da inércia do gesto antes de retomar o radar automaticamente.
    resumeTimerRef.current = window.setTimeout(() => {
      interactingRef.current = false;
      resumeTimerRef.current = null;
    }, 900);
    lastFrameRef.current = null;
  };
  return (
    <section aria-label="Radar Cartola" className="overflow-hidden rounded-2xl border border-accent/20 bg-black/20 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.2)]">
      <div className="mb-2 flex w-full items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-[11px]">📡</span>
          <div className="min-w-0">
            <h2 className="truncate text-[10px] font-black uppercase tracking-[.14em] text-foreground">Radar Cartola</h2>
            <p className="truncate text-[8px] font-bold text-muted">Notícias, tendências e resenha do mercado</p>
          </div>
        </div>
        <span className="shrink-0 text-[8px] font-bold text-muted">Arraste para navegar</span>
      </div>

      <div
        id="radar-cartola-noticias"
        ref={trackRef}
        className="no-scrollbar flex touch-pan-x select-none gap-2 overflow-x-auto px-3"
        onPointerDown={beginInteraction}
        onPointerUp={releaseInteraction}
        onPointerCancel={releaseInteraction}
        onPointerLeave={releaseInteraction}
        onTouchEnd={releaseInteraction}
      >
        {repeatedStories.map((story, repeatedIndex) => {
          const isStoryExpanded = story.kind === "list" && expandedStoryId === story.id;
          const storyContentId = `radar-story-${repeatedIndex}-${story.id}`;
          return (
            <article
              key={`${repeatedIndex}-${story.id}`}
              className={`w-[78vw] max-w-[300px] shrink-0 rounded-xl border px-2.5 py-2 transition-[height] ${toneClasses[story.tone]}`}
            >
              {story.kind === "list" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setExpandedStoryId((current) => current === story.id ? null : story.id)}
                    aria-expanded={isStoryExpanded}
                    aria-controls={storyContentId}
                    className="flex w-full items-center justify-between gap-2 rounded-lg text-left active:bg-white/[.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[8px] font-black uppercase tracking-[.14em] text-accent">
                        Top {story.list.players.length} do Radar
                      </span>
                      <strong className="block truncate text-[11px] text-foreground">{story.list.title}</strong>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[.06] px-2 py-1 text-[8px] font-black uppercase text-muted">
                      {isStoryExpanded ? "Recolher" : `Ver Top ${story.list.players.length}`}
                      <ChevronDown className={`h-3 w-3 transition-transform ${isStoryExpanded ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  <div className="mt-1 border-t border-white/[.06] pt-1">
                    <CompactPlayer
                      highlight={story.list.players[0]}
                      rank={1}
                      onSelectPlayer={onSelectPlayer}
                    />
                  </div>
                  {isStoryExpanded ? (
                    <div id={storyContentId}>
                      {story.list.players.length > 1 ? (
                        <div className="mt-1 divide-y divide-white/[.06]">
                          {story.list.players.slice(1, 3).map((highlight, index) => (
                            <CompactPlayer key={highlight.player.id} highlight={highlight} rank={index + 2} onSelectPlayer={onSelectPlayer} />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 px-1 text-[8px] font-bold text-muted">Ainda não há dados suficientes para o 2º e 3º lugar.</p>
                      )}
                      <p className="mt-1 px-1 text-[8px] font-bold text-muted">{story.list.subtitle}</p>
                    </div>
                  ) : null}
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
