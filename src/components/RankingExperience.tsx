"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Crown,
  Medal,
  Share2,
  Sparkles,
  Target,
  Trophy,
} from "@/components/icons";
import type {
  RankingEntry,
  RankingExperienceData,
  RankingFilter,
  RankingView,
} from "@/lib/ranking";
import { formatDateShort, getInitials } from "@/lib/utils";
import { PlayerAvatar } from "./PlayerAvatar";

const RankingPlayerCardModal = dynamic(() =>
  import("./RankingPlayerCardModal").then((module) => module.RankingPlayerCardModal),
);

type Props = {
  data: RankingExperienceData;
  currentPlayerId: string | null;
};

const FILTERS: Array<{ key: RankingFilter; label: string }> = [
  { key: "general", label: "Geral" },
  { key: "goals", label: "Gols" },
  { key: "assists", label: "Assistências" },
  { key: "wins", label: "Vitórias" },
  { key: "winRate", label: "Aproveitamento" },
  { key: "awards", label: "Prêmios" },
];

const FILTER_LABELS: Record<RankingFilter, string> = {
  general: "pontos",
  goals: "gols",
  assists: "assistências",
  wins: "vitórias",
  winRate: "p.p. de aproveitamento",
  awards: "prêmios",
};

function awardsTotal(entry: RankingEntry) {
  return entry.awards.topScorer + entry.awards.topAssister + entry.awards.bestGoalkeeper + entry.awards.bestDefender;
}

function metricValue(entry: RankingEntry, filter: RankingFilter) {
  if (filter === "goals") return entry.goals;
  if (filter === "assists") return entry.assists;
  if (filter === "wins") return entry.wins;
  if (filter === "winRate") return entry.winRate;
  if (filter === "awards") return awardsTotal(entry);
  return entry.points;
}

function sortRanking(entries: RankingEntry[], filter: RankingFilter) {
  return [...entries].sort((a, b) => {
    const metricDifference = metricValue(b, filter) - metricValue(a, filter);
    if (metricDifference !== 0) return metricDifference;
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.player.name.localeCompare(b.player.name, "pt-BR");
  });
}

function metricDisplay(entry: RankingEntry, filter: RankingFilter) {
  const value = metricValue(entry, filter);
  if (filter === "winRate") return `${value}%`;
  return String(value);
}

function podiumStyle(position: number) {
  if (position === 1) {
    return {
      ring: "border-[#f5cf52] shadow-[0_0_24px_rgba(245,207,82,.28)]",
      base: "from-[#866714]/80 via-[#4f3c08]/70 to-[#211a05]/80 border-[#d5ad38]/50",
      medal: "from-[#fff0a8] via-[#e0b83d] to-[#9d7217] text-[#3b2b07]",
      label: "text-[#f5d45e]",
    };
  }
  if (position === 2) {
    return {
      ring: "border-slate-300 shadow-[0_0_20px_rgba(203,213,225,.18)]",
      base: "from-slate-400/40 via-slate-600/25 to-slate-900/40 border-slate-300/30",
      medal: "from-white via-slate-300 to-slate-500 text-slate-800",
      label: "text-slate-300",
    };
  }
  return {
    ring: "border-[#c47a43] shadow-[0_0_20px_rgba(196,122,67,.18)]",
    base: "from-[#9b542a]/45 via-[#5b2c17]/35 to-[#271109]/60 border-[#b86d3b]/40",
    medal: "from-[#efbc91] via-[#b96d39] to-[#713619] text-[#32160a]",
    label: "text-[#d98a50]",
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function loadCanvasImage(url: string | null) {
  if (!url) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function createPodiumStory(
  podium: RankingEntry[],
  seasonLabel: string,
  rankingLabel: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  const background = ctx.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#07170f");
  background.addColorStop(0.55, "#04100a");
  background.addColorStop(1, "#010603");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.fillStyle = "rgba(204,255,0,.07)";
  for (let x = 35; x < 1080; x += 44) {
    for (let y = 35; y < 1920; y += 44) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ccff00";
  ctx.font = "900 36px Arial";
  ctx.fillText("PELADA DE BAIXA QUALIDADE", 540, 120);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 78px Arial";
  ctx.fillText("PÓDIO DA TEMPORADA", 540, 235);
  ctx.fillStyle = "#91aa9a";
  ctx.font = "700 30px Arial";
  ctx.fillText(`${seasonLabel} · ${rankingLabel}`, 540, 290);

  const visualOrder = [
    { entry: podium[1], position: 2, x: 255, avatarY: 720, baseY: 890, baseHeight: 430, color: "#b9c2cc" },
    { entry: podium[0], position: 1, x: 540, avatarY: 570, baseY: 740, baseHeight: 580, color: "#e5bf45" },
    { entry: podium[2], position: 3, x: 825, avatarY: 790, baseY: 960, baseHeight: 360, color: "#b86d3b" },
  ];

  for (const item of visualOrder) {
    if (!item.entry) continue;
    const displayName = item.entry.player.name;
    const image = await loadCanvasImage(item.entry.player.avatar_url);

    ctx.save();
    ctx.beginPath();
    ctx.arc(item.x, item.avatarY, 108, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - size) / 2;
      const sy = Math.max(0, (image.naturalHeight - size) / 3);
      ctx.drawImage(image, sx, sy, size, size, item.x - 108, item.avatarY - 108, 216, 216);
    } else {
      ctx.fillStyle = "#143324";
      ctx.fillRect(item.x - 108, item.avatarY - 108, 216, 216);
      ctx.fillStyle = "#ccff00";
      ctx.font = "900 56px Arial";
      ctx.fillText(getInitials(item.entry.player.name), item.x, item.avatarY + 18);
    }
    ctx.restore();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(item.x, item.avatarY, 113, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = item.color;
    roundedRect(ctx, item.x - 132, item.avatarY + 102, 264, 62, 31);
    ctx.fill();
    ctx.fillStyle = "#07100b";
    ctx.font = "900 32px Arial";
    ctx.fillText(`${item.position}º LUGAR`, item.x, item.avatarY + 144);

    const baseGradient = ctx.createLinearGradient(0, item.baseY, 0, item.baseY + item.baseHeight);
    baseGradient.addColorStop(0, item.color);
    baseGradient.addColorStop(1, "#101811");
    ctx.fillStyle = baseGradient;
    roundedRect(ctx, item.x - 132, item.baseY, 264, item.baseHeight, 28);
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 32px Arial";
    const shortName = displayName.length > 16 ? `${displayName.slice(0, 15)}…` : displayName;
    ctx.fillText(shortName, item.x, item.baseY + 78);
    ctx.fillStyle = "#ccff00";
    ctx.font = "900 48px Arial";
    ctx.fillText(`${item.entry.points} PTS`, item.x, item.baseY + 142);
    ctx.fillStyle = "rgba(248,250,252,.72)";
    ctx.font = "700 24px Arial";
    ctx.fillText(`${item.entry.goals} G · ${item.entry.assists} A`, item.x, item.baseY + 190);
  }

  ctx.fillStyle = "rgba(204,255,0,.12)";
  roundedRect(ctx, 110, 1490, 860, 210, 40);
  ctx.fill();
  ctx.strokeStyle = "rgba(204,255,0,.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 42px Arial";
  ctx.fillText("O CARTOLA DA NOSSA PELADA", 540, 1580);
  ctx.fillStyle = "#9ab7a5";
  ctx.font = "700 28px Arial";
  ctx.fillText("Gols, assistências e resenha toda semana.", 540, 1640);
  ctx.fillStyle = "#ccff00";
  ctx.font = "900 24px Arial";
  ctx.fillText("PELADA DE BAIXA QUALIDADE", 540, 1830);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  if (!blob) throw new Error("Não foi possível criar a imagem");
  return blob;
}

export function RankingExperience({ data, currentPlayerId }: Props) {
  const [view, setView] = useState<RankingView>("season");
  const [filter, setFilter] = useState<RankingFilter>("general");
  const [selected, setSelected] = useState<{ entry: RankingEntry; position: number } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  const sourceEntries = view === "latest" && data.latestRound
    ? data.latestRound.entries
    : data.general;
  const ranking = useMemo(() => sortRanking(sourceEntries, filter), [sourceEntries, filter]);
  const podium = ranking.slice(0, 3);
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const showPodium = podium.length >= 3;
  const currentPlayerIndex = currentPlayerId
    ? ranking.findIndex((entry) => entry.player.id === currentPlayerId)
    : -1;
  const pinnedEntry = currentPlayerIndex >= 5 ? ranking[currentPlayerIndex] : null;

  async function handleShare() {
    if (podium.length < 3) return;
    setSharing(true);
    setShareMessage("");
    try {
      const filterLabel = FILTERS.find((item) => item.key === filter)?.label || "Geral";
      const roundLabel = view === "latest" && data.latestRound
        ? `Rodada ${String(data.latestRound.number).padStart(2, "0")} · ${filterLabel}`
        : filterLabel;
      const blob = await createPodiumStory(podium, data.seasonLabel, roundLabel);
      const file = new File([blob], "podio-pelada-de-baixa-qualidade.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Pódio da Pelada de Baixa Qualidade",
          text: "Veja o pódio da nossa pelada!",
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        setShareMessage("Arte do pódio baixada!");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Erro ao compartilhar pódio:", error);
      setShareMessage("Não foi possível gerar a arte. Tente novamente.");
    } finally {
      setSharing(false);
    }
  }

  if (data.general.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center space-y-3 p-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
          <Trophy className="h-8 w-8 text-muted" />
        </div>
        <h2 className="font-bold text-foreground">Nenhum dado ainda!</h2>
        <p className="text-sm text-muted">Jogue e encerre partidas para começar a pontuar no ranking.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${pinnedEntry ? "pb-24" : "pb-16"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground">Ranking</h1>
          <p className="mt-0.5 text-xs text-accent">{data.seasonLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing || podium.length < 3}
          className="flex h-11 items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 text-xs font-black text-accent disabled:opacity-40"
        >
          <Share2 className="h-4 w-4" />
          {sharing ? "Gerando..." : "Compartilhar"}
        </button>
      </div>

      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setView("season")}
          className={`rounded-lg py-2.5 text-xs font-black transition-colors ${view === "season" ? "bg-accent text-background" : "text-muted"}`}
        >
          Temporada
        </button>
        <button
          type="button"
          onClick={() => data.latestRound && setView("latest")}
          disabled={!data.latestRound}
          className={`rounded-lg py-2.5 text-xs font-black transition-colors disabled:opacity-40 ${view === "latest" ? "bg-accent text-background" : "text-muted"}`}
        >
          Última rodada
        </button>
      </div>

      {view === "season" && (
        <details className="group rounded-2xl border border-accent/30 bg-accent/[0.08] shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 marker:hidden">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent text-background font-black text-xs shadow-[0_0_10px_rgba(204,255,0,0.4)]">!</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black uppercase tracking-wider text-accent">Ranking pelas 6 melhores partidas</span>
              <span className="block truncate text-[10px] text-muted group-open:hidden">Toque para entender a regra</span>
            </span>
            <span className="text-sm font-black text-accent transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="border-t border-accent/15 px-4 pb-4 pt-3 text-[11px] leading-relaxed text-foreground/90">
            Os pontos da Geral somam as <strong className="text-accent">6 melhores atuações</strong> de cada jogador no ano. Faltas ou dias ruins não prejudicam sua classificação. Toque em qualquer atleta para ver as partidas e a nota de corte.
          </p>
        </details>
      )}

      {view === "latest" && data.latestRound && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-xs text-muted">
          <CalendarDays className="h-4 w-4 text-accent" />
          Rodada {String(data.latestRound.number).padStart(2, "0")} · {formatDateShort(data.latestRound.date)}
        </div>
      )}

      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-black transition-colors ${filter === item.key ? "border-accent bg-accent text-background" : "border-border bg-surface text-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {shareMessage && (
        <p className={`rounded-lg p-2.5 text-center text-xs font-bold ${shareMessage.includes("baixada") ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {shareMessage}
        </p>
      )}

      {showPodium && (
        <section className="pt-7">
          <div className="flex items-end justify-center gap-2 sm:gap-4">
            {podiumOrder.map((entry, visualIndex) => {
              const position = visualIndex === 0 ? 2 : visualIndex === 1 ? 1 : 3;
              const style = podiumStyle(position);
              const height = position === 1 ? "h-36" : position === 2 ? "h-28" : "h-24";
              const above = position > 1 ? ranking[position - 2] : null;
              const gap = above ? Math.max(1, metricValue(above, filter) - metricValue(entry, filter) + 1) : 0;
              return (
                <button
                  key={entry.player.id}
                  type="button"
                  onClick={() => setSelected({ entry, position })}
                  className={`relative flex w-1/3 max-w-[112px] flex-col items-center rounded-t-2xl transition-transform hover:-translate-y-1 focus:outline-none animate-slide-in-bottom stagger-${position}`}
                  aria-label={`Abrir carta de ${entry.player.name}, ${position}º lugar`}
                >
                  {position === 1 && (
                    <Crown className="absolute -top-8 h-8 w-8 rotate-[-7deg] text-[#f5d45e] drop-shadow-lg" fill="currentColor" />
                  )}
                  <div className="relative z-10">
                    <PlayerAvatar
                      name={entry.player.name}
                      avatarUrl={entry.player.avatar_url}
                      frameKey={entry.cosmetics?.frameKey}
                      auraKey={entry.cosmetics?.auraKey}
                      className={`h-16 w-16 rounded-full border-[3px] bg-background text-sm font-black text-muted ${style.ring}`}
                    />
                    <span className={`absolute -bottom-2 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br ${style.medal} shadow-lg`}>
                      {position === 1 ? <Crown className="h-4 w-4" fill="currentColor" /> : <Medal className="h-4 w-4" fill="currentColor" />}
                    </span>
                    {view === "season" && entry.positionChange !== null && (
                      <span className={`absolute -right-3 top-0 inline-flex min-w-6 items-center justify-center rounded-full border border-background bg-surface px-1 py-0.5 text-[8px] font-black ${entry.positionChange > 0 ? "text-success" : entry.positionChange < 0 ? "text-danger" : "text-muted"}`}>
                        {entry.positionChange > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : entry.positionChange < 0 ? <ArrowDown className="h-2.5 w-2.5" /> : "—"}
                        {entry.positionChange !== 0 ? Math.abs(entry.positionChange) : ""}
                      </span>
                    )}
                  </div>
                  <div className="mb-2 mt-4 w-full px-1 text-center">
                    <p className="truncate text-xs font-black text-foreground">{entry.player.name}</p>
                    <p className={`mt-0.5 text-xs font-black ${style.label}`}>{metricDisplay(entry, filter)} <span className="text-[8px] uppercase opacity-70">{FILTER_LABELS[filter]}</span></p>
                  </div>
                  <div className={`w-full rounded-t-2xl border-x border-t bg-gradient-to-b pt-3 ${height} ${style.base}`}>
                    <span className="font-athletic text-3xl font-black text-white/45">{position}</span>
                    {above && (
                      <span className="mt-1 block px-1 text-[8px] font-black text-white/55">Faltam {gap} para subir</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted">Classificação</h2>
          <span className="text-[10px] font-bold text-muted">{ranking.length} jogadores</span>
        </div>
        {(showPodium ? ranking.slice(3) : ranking).map((entry, listIndex) => {
          const index = showPodium ? listIndex + 3 : listIndex;
          const position = index + 1;
          const above = index > 0 ? ranking[index - 1] : null;
          const gap = above ? Math.max(1, metricValue(above, filter) - metricValue(entry, filter) + 1) : 0;
          const displayName = entry.player.name;
          return (
            <button
              key={entry.player.id}
              type="button"
              onClick={() => setSelected({ entry, position })}
              className="glass-card glass-card-hover w-full p-3 text-left animate-fade-in"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 shrink-0 text-center font-athletic text-base font-black text-muted">{position}º</div>
                <PlayerAvatar
                  name={entry.player.name}
                  avatarUrl={entry.player.avatar_url}
                  frameKey={entry.cosmetics?.frameKey}
                  auraKey={entry.cosmetics?.auraKey}
                  className="h-11 w-11 shrink-0 rounded-full border border-border bg-surface text-xs font-black text-foreground"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-black text-foreground">{displayName}</p>
                    {entry.cosmetics?.titleName && (
                      <span className="truncate rounded bg-accent/15 px-1.5 py-0.2 text-[8px] font-black uppercase text-accent border border-accent/25">
                        {entry.cosmetics.titleName}
                      </span>
                    )}
                    {view === "season" && entry.positionChange !== null && (
                      <span className={`inline-flex items-center text-[9px] font-black ${entry.positionChange > 0 ? "text-success" : entry.positionChange < 0 ? "text-danger" : "text-muted"}`}>
                        {entry.positionChange > 0 ? <ArrowUp className="h-3 w-3" /> : entry.positionChange < 0 ? <ArrowDown className="h-3 w-3" /> : "—"}
                        {entry.positionChange !== 0 ? Math.abs(entry.positionChange) : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.awards.topScorer > 0 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[8px] font-black text-accent">Artilheiro da rodada {entry.awards.topScorer}x</span>}
                    {entry.awards.topAssister > 0 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[8px] font-black text-accent">Garçom da rodada {entry.awards.topAssister}x</span>}
                    {entry.awards.bestGoalkeeper > 0 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[8px] font-black text-accent">Goleiro {entry.awards.bestGoalkeeper}x</span>}
                    {entry.awards.bestDefender > 0 && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-black text-amber-300">Xerife da rodada {entry.awards.bestDefender}x</span>}
                    {awardsTotal(entry) === 0 && <span className="text-[9px] text-muted">V: {entry.wins} · G: {entry.goals} · A: {entry.assists}</span>}
                  </div>
                  {above && (
                    <p className="mt-1.5 text-[9px] font-semibold text-muted/80">
                      Faltam {gap} {FILTER_LABELS[filter]} para ultrapassar o {position - 1}º lugar
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="stat-number text-xl text-foreground">{metricDisplay(entry, filter)}</p>
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted">{FILTER_LABELS[filter]}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {pinnedEntry && (
        <button
          type="button"
          onClick={() => setSelected({ entry: pinnedEntry, position: currentPlayerIndex + 1 })}
          className="fixed bottom-[4.65rem] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 items-center gap-3 rounded-2xl border border-accent/50 bg-[#0b2116]/95 p-3 text-left shadow-[0_-8px_30px_rgba(0,0,0,.45)] backdrop-blur-xl"
        >
          <span className="font-athletic text-lg font-black text-accent">{currentPlayerIndex + 1}º</span>
          <PlayerAvatar
            name={pinnedEntry.player.name}
            avatarUrl={pinnedEntry.player.avatar_url}
            frameKey={pinnedEntry.cosmetics?.frameKey}
            auraKey={pinnedEntry.cosmetics?.auraKey}
            className="h-10 w-10 rounded-full border border-accent/40 bg-surface text-xs font-black"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-foreground">Sua posição · {pinnedEntry.player.name}</p>
            <p className="text-[9px] text-muted">Toque para abrir sua carta</p>
          </div>
          <span className="stat-number text-xl text-accent">{metricDisplay(pinnedEntry, filter)}</span>
        </button>
      )}

      {selected && (
        <RankingPlayerCardModal
          entry={selected.entry}
          position={selected.position}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
