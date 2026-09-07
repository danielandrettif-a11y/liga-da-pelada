"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Medal, Share2, Sparkles, Target, Trophy, X } from "@/components/icons";
import type { RankingEntry } from "@/lib/ranking";
import { PlayerAvatar } from "./PlayerAvatar";
import { cosmeticNameplateImage } from "@/lib/fantasy/cosmetics";
import {
  buildRankingCardContent,
  getRankingCardLayout,
  getRankingCardTheme,
  rankingCardBoxPixels,
  rankingCardBoxStyle,
  type RankingCardPhotoShape,
} from "@/lib/ranking-card-layout";
import { getInitials } from "@/lib/utils";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  entry: RankingEntry;
  position: number;
  onClose: () => void;
};

function signedPoints(points: number) {
  return points > 0 ? `+${points}` : String(points);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

async function loadShareImage(url: string | null) {
  if (!url) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

type CanvasBox = { x: number; y: number; width: number; height: number };

function tracePhotoShape(context: CanvasRenderingContext2D, shape: RankingCardPhotoShape, box: CanvasBox, inset = 0) {
  const x = box.x + inset;
  const y = box.y + inset;
  const width = box.width - inset * 2;
  const height = box.height - inset * 2;
  context.beginPath();
  void shape;
  const points = [[.1, 0], [.9, 0], [1, .09], [.93, .81], [.5, 1], [.07, .81], [0, .09]];
  points.forEach(([pointX, pointY], index) => {
    const targetX = x + width * pointX;
    const targetY = y + height * pointY;
    if (index === 0) context.moveTo(targetX, targetY);
    else context.lineTo(targetX, targetY);
  });
  context.closePath();
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, box: CanvasBox, focusY: number) {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    box.x + (box.width - drawWidth) / 2,
    box.y + (box.height - drawHeight) * focusY,
    drawWidth,
    drawHeight,
  );
}

function wrapCanvasName(context: CanvasRenderingContext2D, name: string, maxWidth: number) {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["JOGADOR"];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCanvasName(
  context: CanvasRenderingContext2D,
  name: string,
  title: string | null | undefined,
  box: CanvasBox,
  color: string,
) {
  const showTitle = Boolean(title);
  const titleHeight = showTitle ? 22 : 0;
  const nameHeight = box.height - titleHeight;
  let fontSize = Math.min(54, nameHeight * .48);
  let lines: string[] = [];
  while (fontSize >= 22) {
    context.font = `900 ${fontSize}px Arial`;
    lines = wrapCanvasName(context, name, box.width * .72);
    if (lines.length <= 2 && lines.every((line) => context.measureText(line).width <= box.width * .72)) break;
    fontSize -= 2;
  }
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lineHeight = fontSize * .9;
  const contentHeight = lines.length * lineHeight;
  const firstY = box.y + (nameHeight - contentHeight) / 2 + lineHeight / 2;
  lines.slice(0, 2).forEach((line, index) => context.fillText(line, box.x + box.width / 2, firstY + index * lineHeight, box.width * .74));
  if (showTitle) {
    context.font = "900 16px Arial";
    context.fillStyle = "rgba(255,255,255,.78)";
    context.fillText(`✦ ${title!.toUpperCase()}`, box.x + box.width / 2, box.y + box.height - 13, box.width * .68);
  }
  context.textBaseline = "alphabetic";
}

async function createPlayerStory(entry: RankingEntry, position: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  const theme = getRankingCardTheme(position);
  const layout = getRankingCardLayout();
  const cardContent = buildRankingCardContent(entry, position);
  const [cardArtwork, avatar, nameplateArtwork] = await Promise.all([
    loadShareImage(theme.artwork),
    loadShareImage(entry.player.avatar_url),
    loadShareImage(cosmeticNameplateImage(entry.cosmetics?.nameplateKey)),
  ]);

  const background = context.createLinearGradient(0, 0, 0, 1920);
  background.addColorStop(0, "#020b06");
  background.addColorStop(0.5, "#071c10");
  background.addColorStop(1, "#020905");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);
  context.fillStyle = "rgba(204,255,0,.05)";
  for (let y = 40; y < 1880; y += 52) for (let x = 28; x < 1060; x += 52) context.fillRect(x, y, 3, 3);

  context.textAlign = "center";
  context.fillStyle = "#ccff00";
  context.font = "900 italic 52px Arial";
  context.fillText("PELADA DE BAIXA QUALIDADE", 540, 112);
  context.fillStyle = "#91a498";
  context.font = "800 24px Arial";
  context.fillText("CARTA DA TEMPORADA", 540, 158);

  const card = { x: 95, y: 215, width: 890, height: 1335 };
  if (cardArtwork) {
    context.drawImage(cardArtwork, card.x, card.y, card.width, card.height);
  } else {
    context.save();
    roundedRect(context, card.x, card.y, card.width, card.height, 70);
    context.clip();
    const cardGradient = context.createLinearGradient(card.x, card.y, card.x + card.width, card.y + card.height);
    cardGradient.addColorStop(0, theme.light);
    cardGradient.addColorStop(0.48, theme.base);
    cardGradient.addColorStop(1, theme.deep);
    context.fillStyle = cardGradient;
    context.fillRect(card.x, card.y, card.width, card.height);
    context.restore();
  }

  const headerBox = rankingCardBoxPixels(layout.header, card);
  context.textAlign = "center";
  context.fillStyle = theme.edge;
  context.font = "900 20px Arial";
  context.fillText(cardContent.header, headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height * .68, headerBox.width);

  const scoreBox = rankingCardBoxPixels(layout.score, card);
  context.textAlign = "left";
  context.fillStyle = theme.ink;
  context.font = `900 ${Math.min(105, scoreBox.width * .43)}px Arial`;
  context.fillText(cardContent.points, scoreBox.x, scoreBox.y + scoreBox.height * .34, scoreBox.width);
  context.font = "900 22px Arial";
  context.fillText("PTS", scoreBox.x + 8, scoreBox.y + scoreBox.height * .44);
  context.font = "900 27px Arial";
  context.fillText(cardContent.profile, scoreBox.x, scoreBox.y + scoreBox.height * .65, scoreBox.width);
  context.font = "900 20px Arial";
  context.fillText(cardContent.placement, scoreBox.x, scoreBox.y + scoreBox.height * .8);

  const photoBox = rankingCardBoxPixels(layout.photo, card);
  context.save();
  tracePhotoShape(context, layout.photoShape, photoBox, 7);
  context.clip();
  if (avatar) {
    drawCoverImage(context, avatar, photoBox, .18);
  } else {
    context.fillStyle = "rgba(0,0,0,.28)";
    context.fillRect(photoBox.x, photoBox.y, photoBox.width, photoBox.height);
    context.fillStyle = theme.ink;
    context.textAlign = "center";
    context.font = `900 ${photoBox.width * .3}px Arial`;
    context.fillText(getInitials(entry.player.name), photoBox.x + photoBox.width / 2, photoBox.y + photoBox.height * .58);
  }
  context.restore();
  context.strokeStyle = theme.edge;
  context.lineWidth = 7;
  tracePhotoShape(context, layout.photoShape, photoBox, 3.5);
  context.stroke();

  const nameBox = rankingCardBoxPixels(layout.name, card);
  if (nameplateArtwork) context.drawImage(nameplateArtwork, nameBox.x, nameBox.y, nameBox.width, nameBox.height);
  else {
    context.fillStyle = "rgba(0,0,0,.18)";
    roundedRect(context, nameBox.x, nameBox.y, nameBox.width, nameBox.height, 18);
    context.fill();
  }
  drawCanvasName(context, cardContent.name, cardContent.title, nameBox, theme.ink);

  const awardsBox = rankingCardBoxPixels(layout.awards, card);
  context.textAlign = "center";
  context.fillStyle = theme.ink;
  context.font = "900 15px Arial";
  cardContent.awards.forEach((award, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cellWidth = awardsBox.width / 2;
    const cellHeight = awardsBox.height / 2;
    context.fillText(
      `${award.label.toUpperCase()} ${award.value}x`,
      awardsBox.x + cellWidth * (col + .5),
      awardsBox.y + cellHeight * (row + .58),
      cellWidth * .78,
    );
  });

  const statsBox = rankingCardBoxPixels(layout.stats, card);
  cardContent.stats.forEach(({ value, label }, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const cellWidth = statsBox.width / 3;
    const cellHeight = statsBox.height / 2;
    const centerX = statsBox.x + cellWidth * (col + .5);
    const centerY = statsBox.y + cellHeight * (row + .5);
    context.fillStyle = theme.ink;
    context.font = `900 ${Math.min(48, cellHeight * .46)}px Arial`;
    context.fillText(String(value), centerX, centerY - cellHeight * .02, cellWidth * .8);
    context.fillStyle = "rgba(255,255,255,.68)";
    context.font = `900 ${Math.min(15, cellHeight * .14)}px Arial`;
    context.fillText(label, centerX, centerY + cellHeight * .28, cellWidth * .7);
  });

  context.fillStyle = "#ffffff";
  context.font = "900 31px Arial";
  context.fillText("COMPARTILHE SUA CARTA", 540, 1695);
  context.fillStyle = "#91a498";
  context.font = "700 22px Arial";
  context.fillText("pelada-de-baixa-qualidade", 540, 1740);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem.")), "image/png", 0.95));
}

export function RankingPlayerCardModal({ entry, position, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showBestRounds, setShowBestRounds] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const dialogScrollRef = useRef<HTMLDivElement>(null);
  const bestRoundsRef = useRef<HTMLDivElement>(null);
  useDialogViewport(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!showBestRounds) return;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogScrollRef.current;
      const rounds = bestRoundsRef.current;
      if (!dialog || !rounds) return;
      dialog.scrollTo({ top: Math.max(0, rounds.offsetTop - 8), behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showBestRounds]);

  const theme = getRankingCardTheme(position);
  const layout = getRankingCardLayout();
  const cardContent = buildRankingCardContent(entry, position);
  const displayName = cardContent.name;
  const nameplateArtwork = cosmeticNameplateImage(entry.cosmetics?.nameplateKey);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  async function shareCard() {
    setSharing(true);
    setShareError("");
    try {
      const blob = await createPlayerStory(entry, position);
      const file = new File([blob], `carta-${entry.player.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `Carta de ${entry.player.name}`, text: "Minha carta na Pelada de Baixa Qualidade", files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Erro ao compartilhar carta:", error);
      setShareError("Não foi possível gerar a carta. Tente novamente.");
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="mobile-dialog-backdrop z-[99999] fixed inset-0 bg-black/90 backdrop-blur-md animate-fade-in flex items-center justify-center p-3 sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogScrollRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Carta de ${displayName}`}
        className="mobile-dialog-scroll relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-[360px] overflow-y-auto overscroll-contain rounded-3xl p-1.5 pb-6 touch-pan-y [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]"
      >
        {/* Botão de Fechar fixado no topo */}
        <div className="sticky top-0 z-50 flex w-full justify-end pointer-events-none mb-[-2.25rem] pr-1 pt-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar carta"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/85 text-white shadow-xl backdrop-blur-md hover:scale-105 active:scale-95 transition-transform"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[2/3] w-full text-white" style={{ filter: `drop-shadow(0 20px 30px ${theme.glow})` }}>
          <img src={theme.artwork} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />

          <header className="absolute z-10 flex items-center justify-center truncate text-[8px] font-black uppercase tracking-[.16em]" style={{ ...rankingCardBoxStyle(layout.header), color: theme.edge }}>
            {cardContent.header}
          </header>

          <div className="absolute z-10 flex flex-col items-start pl-1 font-athletic drop-shadow-[0_2px_5px_rgba(0,0,0,.9)]" style={rankingCardBoxStyle(layout.score)}>
              <span className={`player-card-rating font-black leading-none ${cardContent.points.length > 4 ? "text-[2.05rem]" : "text-[2.65rem]"}`} style={{ color: theme.edge }}>{cardContent.points}</span>
              <span className="mt-0.5 text-[9px] font-black tracking-[.22em] text-white/75">PTS</span>
              <span className="mt-2 border-t border-white/30 pt-2 text-[11px] font-black uppercase leading-tight text-white">{cardContent.profile}</span>
              <span className="mt-2 rounded-md border border-white/25 bg-black/35 px-2 py-0.5 text-xs font-black text-white">{cardContent.placement}</span>
          </div>

          <div
            className={`ranking-card-photo ranking-card-photo--${layout.photoShape} absolute z-10`}
            style={{ ...rankingCardBoxStyle(layout.photo), backgroundColor: theme.edge, filter: `drop-shadow(0 8px 12px ${theme.glow})` }}
          >
            <PlayerAvatar
              name={entry.player.name}
              avatarUrl={entry.player.avatar_url}
              clickable={false}
              className="ranking-card-photo__avatar h-full w-full bg-[#07150d] text-2xl font-black"
              imageClassName="ranking-card-photo__image h-full w-full object-cover"
              frameKey={null}
              auraKey={null}
              frameClass=""
            />
          </div>

          <div className="absolute z-10 flex items-center justify-center px-1 text-center" style={rankingCardBoxStyle(layout.name)}>
            <div
              className="ranking-card-nameplate-surface flex h-full min-w-0 w-full flex-col items-center justify-center bg-[length:100%_100%] bg-center bg-no-repeat px-[9%]"
              style={nameplateArtwork ? { backgroundImage: `url(${nameplateArtwork})` } : undefined}
            >
              <h2 className={`ranking-card-player-name font-athletic font-black uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.9)] ${displayName.length > 22 ? "text-sm leading-[.9] tracking-normal" : displayName.length > 15 ? "text-base leading-none tracking-tight" : "text-xl leading-none tracking-wide"}`}>{displayName}</h2>
              <p className="mt-0.5 min-h-[.55rem] max-w-full truncate text-[7px] font-black uppercase tracking-[.13em]" style={{ color: theme.edge }}>
                {cardContent.title ? `✦ ${cardContent.title}` : ""}
              </p>
            </div>
          </div>

          <div className="ranking-card-awards absolute z-10 grid grid-cols-2 grid-rows-2 text-center" style={rankingCardBoxStyle(layout.awards)}>
            {cardContent.awards.map(({ key, label, value }) => {
              const Icon = key === "topScorer" ? Target : key === "topAssister" ? Sparkles : Medal;
              return (
                <span key={key} className="flex min-w-0 items-center justify-center gap-1 truncate px-1 text-[7px] font-black uppercase text-white">
                  <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: theme.edge }} /> {label} {value}x
                </span>
              );
            })}
          </div>

          <div className="ranking-card-stats absolute z-10 grid grid-cols-3 grid-rows-2 font-athletic" style={rankingCardBoxStyle(layout.stats)}>
            {cardContent.stats.map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center justify-center text-center">
                <p className="player-card-number text-[1.12rem] leading-none text-white drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]">{value}</p>
                <p className="mt-0.5 text-[6px] font-black tracking-[.12em] text-white/65">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {entry.fitness && <div className="mx-auto -mt-1 grid w-[88%] grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#07150d]/95 p-2 text-center shadow-xl">
          <div><p className="font-athletic text-sm font-black text-accent">{entry.fitness.distanceKm} km</p><p className="text-[7px] font-black uppercase text-muted">Distância Ranked</p></div>
          <div><p className="font-athletic text-sm font-black text-accent">{entry.fitness.averageSpeedKmh} km/h</p><p className="text-[7px] font-black uppercase text-muted">Velocidade média</p></div>
        </div>}

        {/* 6 MELHORES PARTIDAS - SANFONA / ACCORDION */}
        {entry.bestRounds && entry.bestRounds.length > 0 && (
          <div ref={bestRoundsRef} className="mx-auto mt-3.5 w-[94%] overflow-hidden rounded-2xl border border-border/80 bg-[#07150d]/95 shadow-xl backdrop-blur-md transition-all">
            <button
              type="button"
              onClick={() => setShowBestRounds((prev) => !prev)}
              className="w-full p-3.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
              aria-expanded={showBestRounds}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="block font-athletic text-xs font-black uppercase tracking-wider text-foreground">
                      6 Melhores Partidas
                    </span>
                    <span className="text-[10px] text-muted">
                      {showBestRounds ? "Toque para recolher" : "Toque para ver os scouts"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-black text-accent">
                    {entry.bestRounds.filter((r) => r.countedInTop6).length}/6 no ranking
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform duration-200 ${
                      showBestRounds ? "rotate-180 text-accent" : ""
                    }`}
                  />
                </div>
              </div>

              {!showBestRounds && (
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {entry.bestRounds.filter((r) => r.countedInTop6).slice(0, 6).map((round) => (
                    <span key={round.roundId} className="flex items-center justify-between rounded-lg border border-accent/15 bg-accent/[0.07] px-2 py-1.5">
                      <span className="text-[8px] font-black uppercase text-muted">R{String(round.roundNumber).padStart(2, "0")}</span>
                      <span className="font-athletic text-sm font-black text-accent">{round.points}</span>
                    </span>
                  ))}
                </div>
              )}
            </button>

            {/* Conteúdo Expansível */}
            {showBestRounds && (
              <div className="border-t border-border/60 p-3 pt-2 animate-fade-in">
                <p className="px-1 pb-2 text-[9px] font-bold uppercase tracking-wide text-muted">
                  Toque em uma rodada para ver como os pontos foram feitos
                </p>
                <div className="divide-y divide-border/40">
                  {entry.bestRounds.filter((r) => r.countedInTop6).slice(0, 6).map((r, idx) => (
                    <div
                      key={r.roundId}
                      className="text-xs text-foreground"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedRoundId((current) => current === r.roundId ? null : r.roundId)}
                        className="flex w-full items-center justify-between gap-2 px-1 py-3 text-left transition-colors hover:bg-white/[0.025]"
                        aria-expanded={expandedRoundId === r.roundId}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-black text-background">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold">
                              Rodada {String(r.roundNumber).padStart(2, "0")}
                            </p>
                            <p className="text-[9px] text-muted">
                              {r.games}J · {r.goals}G · {r.assists}A · {r.wins}V · {r.draws}E · {r.losses}D
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-right">
                            <span className="block font-athletic text-base font-black text-accent">{r.points} pts</span>
                          <span className="block text-[8px] font-bold text-accent/80 uppercase">
                            Somando
                          </span>
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform ${expandedRoundId === r.roundId ? "rotate-180 text-accent" : ""}`} />
                        </div>
                      </button>

                      {expandedRoundId === r.roundId && (
                        <div className="mb-3 rounded-xl border border-accent/20 bg-accent/[0.06] p-3 animate-fade-in">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase text-foreground">Detalhamento da pontuação</p>
                              <p className="mt-0.5 text-[9px] text-muted">
                                {r.date ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${r.date}T12:00:00`)) : `Rodada ${r.roundNumber}`}
                              </p>
                            </div>
                            <span className="font-athletic text-lg font-black text-accent">{signedPoints(r.points)} pts</span>
                          </div>

                          {r.pointBreakdown.length > 0 ? (
                            <div className="space-y-1.5">
                              {r.pointBreakdown.map((item) => (
                                <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg bg-black/15 px-2.5 py-2">
                                  <span className="text-[10px] text-foreground">{item.count}× {item.label}</span>
                                  <span className={`text-[10px] font-black ${item.points < 0 ? "text-danger" : item.points > 0 ? "text-accent" : "text-muted"}`}>
                                    {signedPoints(item.points)} pts
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-lg bg-black/15 px-2.5 py-2 text-[10px] text-muted">Nenhum evento pontuável registrado.</p>
                          )}

                          <Link href={`/rodadas/${r.roundId}`} className="mt-2.5 flex items-center justify-center rounded-lg border border-border py-2 text-[9px] font-black uppercase text-foreground hover:bg-white/[0.04]">
                            Abrir rodada completa
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Nota de Corte */}
                <div className="mt-3 rounded-xl border border-accent/25 bg-accent/10 p-2.5 text-center text-[11px] font-bold text-foreground">
                  {entry.bestRounds.length >= 6 ? (
                    <span>
                      🎯 <strong className="text-accent">Nota de corte:</strong> Precisa fazer{" "}
                      <strong className="text-accent">&gt; {entry.minPointsToEnterTop6} pts</strong> na próxima rodada para subir no ranking.
                    </span>
                  ) : (
                    <span>
                      🎯 <strong className="text-accent">Vagas livres:</strong> {entry.bestRounds.length}/6 jogos. Qualquer pontuação na próxima rodada entrará somando!
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Botões de Ação */}
        <div className="mx-auto mt-4 grid w-[90%] gap-2">
          <button
            type="button"
            onClick={shareCard}
            disabled={sharing}
            className="flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 py-3.5 text-sm font-black uppercase tracking-wide text-accent hover:bg-accent/15 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            {sharing ? "Gerando Stories..." : "Compartilhar carta"}
          </button>
          <Link
            href={`/jogadores/${entry.player.id}`}
            className="flex items-center justify-center rounded-xl bg-accent py-3.5 text-sm font-black uppercase tracking-wide text-background shadow-lg shadow-accent/15 hover:brightness-110 active:scale-[0.99] transition-all"
          >
            Abrir perfil completo
          </Link>
          {shareError && (
            <p className="rounded-lg bg-danger/10 p-2 text-center text-[10px] font-bold text-danger">
              {shareError}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
