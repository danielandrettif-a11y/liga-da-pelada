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
import { getOverallComposition } from "@/lib/overall-explanation";

type Props = {
  entry: RankingEntry;
  position: number;
  onClose: () => void;
  scoringMode?: "official" | "legacy";
};

function signedPoints(points: number) {
  return points > 0 ? `+${points}` : String(points);
}

const CARD_TREND = {
  rising: { symbol: "↑", label: "em alta", color: "#ccff00" },
  steady: { symbol: "→", label: "estável", color: "rgba(255,255,255,.72)" },
  falling: { symbol: "↓", label: "em baixa", color: "#ff8373" },
} as const;

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
  const titleHeight = showTitle ? 19 : 0;
  const nameHeight = box.height - titleHeight;
  let fontSize = Math.min(46, nameHeight * .44);
  let lines: string[] = [];
  while (fontSize >= 22) {
    context.font = `900 ${fontSize}px Arial`;
    lines = wrapCanvasName(context, name, box.width * .66);
    if (lines.length <= 2 && lines.every((line) => context.measureText(line).width <= box.width * .66)) break;
    fontSize -= 2;
  }
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lineHeight = fontSize * .9;
  const contentHeight = lines.length * lineHeight;
  const firstY = box.y + (nameHeight - contentHeight) / 2 + lineHeight / 2;
  lines.slice(0, 2).forEach((line, index) => context.fillText(line, box.x + box.width / 2, firstY + index * lineHeight, box.width * .68));
  if (showTitle) {
    context.font = "900 14px Arial";
    context.fillStyle = color;
    context.shadowColor = "rgba(0,0,0,.95)";
    context.shadowBlur = 4;
    context.shadowOffsetY = 1;
    context.fillText(`✦ ${title!.toUpperCase()}`, box.x + box.width / 2, box.y + nameHeight + 12, box.width * .68);
    context.shadowColor = "transparent";
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
  context.font = `900 ${Math.min(116, scoreBox.width * .43)}px Arial`;
  context.fillText(cardContent.rating, scoreBox.x, scoreBox.y + scoreBox.height * .36, scoreBox.width);
  context.font = "900 22px Arial";
  const trendSuffix = cardContent.ratingTrend ? ` ${CARD_TREND[cardContent.ratingTrend].symbol}` : "";
  context.fillText(`${cardContent.ratingLabel}${trendSuffix} · ${cardContent.placement}`, scoreBox.x + 8, scoreBox.y + scoreBox.height * .46);

  const positionTop = scoreBox.y + scoreBox.height * .61;
  const positionCellWidth = scoreBox.width / 3;
  const positionCellHeight = scoreBox.height * .34;
  cardContent.positionRatings.forEach(({ value, label, trend, isBest }, index) => {
    const cellX = scoreBox.x + positionCellWidth * index;
    const cellY = positionTop;
    const centerX = cellX + positionCellWidth / 2;
    if (isBest) {
      context.fillStyle = `${theme.edge}24`;
      roundedRect(context, cellX + 3, cellY + 3, positionCellWidth - 6, positionCellHeight - 6, 10);
      context.fill();
      context.strokeStyle = `${theme.edge}a8`;
      context.lineWidth = 2;
      roundedRect(context, cellX + 3, cellY + 3, positionCellWidth - 6, positionCellHeight - 6, 10);
      context.stroke();
    }
    context.textAlign = "left";
    context.fillStyle = isBest ? theme.edge : theme.ink;
    context.font = isBest
      ? `900 italic ${Math.min(34, positionCellWidth * .31)}px Arial`
      : `900 ${Math.min(30, positionCellWidth * .28)}px Arial`;
    const valueWidth = context.measureText(value).width;
    const trendFontSize = Math.min(16, positionCellWidth * .14);
    context.font = `900 ${trendFontSize}px Arial`;
    const trendWidth = context.measureText(CARD_TREND[trend].symbol).width;
    const valueStart = centerX - (valueWidth + trendWidth + 5) / 2;
    context.font = isBest
      ? `900 italic ${Math.min(34, positionCellWidth * .31)}px Arial`
      : `900 ${Math.min(30, positionCellWidth * .28)}px Arial`;
    context.fillText(value, valueStart, cellY + positionCellHeight * .48, positionCellWidth * .7);
    context.fillStyle = CARD_TREND[trend].color;
    context.font = `900 ${trendFontSize}px Arial`;
    context.fillText(CARD_TREND[trend].symbol, valueStart + valueWidth + 5, cellY + positionCellHeight * .48);
    context.fillStyle = isBest ? theme.edge : "rgba(255,255,255,.68)";
    context.textAlign = "center";
    context.font = `900 ${Math.min(12, positionCellWidth * .11)}px Arial`;
    context.fillText(label, centerX, cellY + positionCellHeight * .74, positionCellWidth * .9);
  });

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

  const profileBox = rankingCardBoxPixels(layout.profile, card);
  context.fillStyle = "rgba(2,12,8,.92)";
  roundedRect(context, profileBox.x, profileBox.y, profileBox.width, profileBox.height, 12);
  context.fill();
  context.strokeStyle = theme.edge;
  context.lineWidth = 2.5;
  roundedRect(context, profileBox.x, profileBox.y, profileBox.width, profileBox.height, 12);
  context.stroke();
  context.fillStyle = theme.edge;
  context.textAlign = "center";
  context.font = "900 14px Arial";
  context.fillText(`TAG · ${cardContent.profile}`, profileBox.x + profileBox.width / 2, profileBox.y + profileBox.height * .67, profileBox.width * .88);

  if (cardContent.speedStars) {
    const speedBox = rankingCardBoxPixels(layout.speed, card);
    context.save();
    context.shadowColor = "rgba(0,0,0,.85)";
    context.shadowBlur = 10;
    context.shadowOffsetY = 3;
    context.fillStyle = "rgba(2,12,8,.9)";
    roundedRect(context, speedBox.x, speedBox.y, speedBox.width, speedBox.height, 12);
    context.fill();
    context.shadowColor = "transparent";
    context.strokeStyle = theme.edge;
    context.lineWidth = 3;
    roundedRect(context, speedBox.x, speedBox.y, speedBox.width, speedBox.height, 12);
    context.stroke();
    context.shadowColor = "rgba(0,0,0,.95)";
    context.shadowBlur = 4;
    context.fillStyle = theme.edge;
    context.textAlign = "center";
    context.font = "900 18px Arial";
    context.fillText(`VEL ${cardContent.speedStars}`, speedBox.x + speedBox.width / 2, speedBox.y + speedBox.height * .68, speedBox.width * .88);
    context.restore();
  }

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

export function RankingPlayerCardModal({ entry, position, onClose, scoringMode = "official" }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showBestRounds, setShowBestRounds] = useState(false);
  const [showOverallExplanation, setShowOverallExplanation] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const dialogScrollRef = useRef<HTMLDivElement>(null);
  const bestRoundsRef = useRef<HTMLDivElement>(null);
  useDialogViewport(true, onClose);

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
  const overallComposition = getOverallComposition(entry.player.overall_traits, entry.overallPositions, {
    goalkeeperGames: entry.overallGoalkeeperGames,
    goalkeeperRounds: entry.overallGoalkeeperRounds,
    threePositionModel: true,
  });
  const goalkeeperGames = Number(entry.overallGoalkeeperGames || 0);
  const goalkeeperRounds = Number(entry.overallGoalkeeperRounds || 0);
  const goalkeeperEligible = goalkeeperGames >= 8 && goalkeeperRounds >= 3;
  const goalkeeperIncluded = overallComposition?.items.some((item) => item.role === "GOL") === true;
  const goalkeeperAverage = entry.goalkeeperStats?.games
    ? entry.goalkeeperStats.goalsConceded / entry.goalkeeperStats.games
    : 0;
  const displayedBestRounds = scoringMode === "legacy" ? entry.legacyBestRounds : entry.bestRounds;
  const displayedMinimum = scoringMode === "legacy" ? entry.legacyMinPointsToEnterTop6 : entry.minPointsToEnterTop6;
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
              <div className="flex min-h-0 w-full flex-1 flex-col items-start justify-center">
                <span className={`player-card-rating origin-left scale-x-[1.08] font-black leading-none tracking-[-.04em] ${cardContent.rating.length > 4 ? "text-[2.5rem]" : "text-[3.15rem]"}`} style={{ color: theme.edge }}>{cardContent.rating}</span>
                <span className="mt-1 text-[9px] font-black tracking-[.14em] text-white/75" aria-label={cardContent.ratingTrend ? `OVR ${CARD_TREND[cardContent.ratingTrend].label}, posição ${cardContent.placement}` : `OVR indisponível, posição ${cardContent.placement}`}>
                  {cardContent.ratingLabel}{cardContent.ratingTrend && <> <span style={{ color: CARD_TREND[cardContent.ratingTrend].color }}>{CARD_TREND[cardContent.ratingTrend].symbol}</span></>} <span className="tracking-normal">· {cardContent.placement}</span>
                </span>
              </div>
              <div className="ranking-card-positions grid h-[39%] min-h-0 w-full shrink-0 grid-cols-3 grid-rows-1 gap-0.5 pr-0.5">
                {cardContent.positionRatings.map(({ key, value, label, trend, isBest }) => (
                  <div key={key} aria-label={`${label} ${value}, ${CARD_TREND[trend].label}`} className={`ranking-card-position flex min-w-0 flex-col items-center justify-center px-0 text-center ${isBest ? "ranking-card-position--best" : ""}`} style={isBest ? { borderColor: `${theme.edge}a8`, backgroundColor: `${theme.edge}24`, boxShadow: `inset 0 0 8px ${theme.edge}1f` } : undefined}>
                    <span className="flex items-center gap-px leading-none">
                      <span className={isBest ? "font-athletic text-[16px] font-black italic" : "font-sans text-[14px] font-black text-white"} style={isBest ? { color: theme.edge } : undefined}>{value}</span>
                      <span className="text-[8px] font-black" style={{ color: CARD_TREND[trend].color }}>{CARD_TREND[trend].symbol}</span>
                    </span>
                    <span className={`mt-1 text-[5px] font-black leading-none tracking-[.04em] ${isBest ? "text-white" : "text-white/60"}`}>{label}</span>
                  </div>
                ))}
              </div>
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
              imageClassName="ranking-card-photo__image h-full w-full object-cover transform-gpu"
              frameKey={null}
              auraKey={null}
              frameClass=""
              sizes="(max-width: 640px) 180px, 260px"
              quality={90}
            />
          </div>

          <div
            aria-label={`Tag fluida ${cardContent.profile}`}
            className="absolute z-20 flex items-center justify-center rounded-md border bg-[#020c08]/90 px-1 text-center text-[6px] font-black uppercase tracking-[.08em] shadow-[0_3px_10px_rgba(0,0,0,.85)]"
            style={{ ...rankingCardBoxStyle(layout.profile), borderColor: theme.edge, color: theme.edge, textShadow: "0 1px 3px rgba(0,0,0,.95)" }}
          >
            TAG · {cardContent.profile}
          </div>

          {cardContent.speedStars && (
            <div
              className="absolute z-20 flex items-center justify-center gap-1 rounded-md border-[1.5px] bg-[#020c08]/90 text-[8px] font-black tracking-[.08em] shadow-[0_3px_10px_rgba(0,0,0,.85)]"
              style={{ ...rankingCardBoxStyle(layout.speed), borderColor: theme.edge, color: theme.edge, textShadow: "0 1px 3px rgba(0,0,0,.95)" }}
            >
              <span className="text-white">VEL</span><span>{cardContent.speedStars}</span>
            </div>
          )}

          <div className="absolute z-10 flex items-center justify-center px-1 text-center" style={rankingCardBoxStyle(layout.name)}>
            <div
              className="ranking-card-nameplate-surface flex h-full min-w-0 w-full flex-col items-center justify-center overflow-hidden bg-[length:100%_100%] bg-center bg-no-repeat px-[14%] py-[3%]"
              style={nameplateArtwork ? { backgroundImage: `url(${nameplateArtwork})` } : undefined}
            >
              <h2 className={`ranking-card-player-name max-h-[1.9em] overflow-hidden font-athletic font-black uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.9)] ${displayName.length > 22 ? "text-[11px] leading-[.92] tracking-normal" : displayName.length > 13 ? "text-[13px] leading-[.95] tracking-normal" : "text-[17px] leading-none tracking-[.04em]"}`}>{displayName}</h2>
              {cardContent.title && <p className="mt-0.5 max-w-full truncate text-[7px] font-black uppercase tracking-[.13em] drop-shadow-[0_1px_2px_rgba(0,0,0,.95)]" style={{ color: theme.ink }}>✦ {cardContent.title}</p>}
            </div>
          </div>

          <div className="ranking-card-awards absolute z-10 grid grid-cols-2 grid-rows-2 text-center" style={rankingCardBoxStyle(layout.awards)}>
            {cardContent.awards.map(({ key, label, value }) => {
              const Icon = key === "roundMvp" ? Trophy : key === "topScorer" ? Target : key === "topAssister" ? Sparkles : Medal;
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

        <div className="mx-auto mt-3.5 w-[94%] overflow-hidden rounded-2xl border border-accent/25 bg-[#07150d]/95 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setShowOverallExplanation((current) => !current)}
            className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
            aria-expanded={showOverallExplanation}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Target className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="block font-athletic text-xs font-black uppercase tracking-wider text-foreground">Como seu OVR é calculado</span>
                <span className="block truncate text-[10px] text-muted">
                  {Number(entry.overallGoalkeeperGames || 0) > 0
                    ? goalkeeperIncluded
                      ? "Seu OVR GOL participa do cálculo geral"
                      : goalkeeperEligible
                        ? "Seu OVR GOL já é elegível, mas está fora das 3 maiores notas"
                        : `${goalkeeperGames}/8 jogos e ${goalkeeperRounds}/3 rodadas no gol para entrar no geral`
                    : overallComposition
                      ? `Seu geral usa ${overallComposition.items.map((item) => item.label).join(" + ")}`
                      : "Entenda as notas da sua carta"}
                </span>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${showOverallExplanation ? "rotate-180 text-accent" : ""}`} />
          </button>

          {showOverallExplanation && (
            <div className="space-y-3 border-t border-border/60 p-3.5 text-[10px] leading-relaxed text-muted animate-fade-in">
              {overallComposition ? (
                <>
                  <div className="rounded-xl border border-accent/20 bg-accent/[0.07] p-3">
                    <p className="font-black uppercase tracking-wide text-accent">Sua conta nesta carta</p>
                    <p className="mt-1.5 text-xs font-black text-foreground">
                      {overallComposition.items.map((item) => `${item.value.toFixed(1).replace(".", ",")} (${item.label}) × ${Math.round(item.weight * 100)}%`).join(" + ")}
                      {` ≈ ${(entry.overall ?? overallComposition.value).toFixed(1).replace(".", ",")}`}
                    </p>
                    <p className="mt-1.5">O geral usa sempre 50% da maior nota elegível, 35% da segunda e 15% da terceira. GOL só participa depois de 8 partidas reais distribuídas em pelo menos 3 rodadas.</p>
                  </div>

                  <div>
                    <p className="font-black text-foreground">Como cada posição evolui</p>
                    <p className="mt-1">A nota começa em 70 e usa até as 8 rodadas oficiais finalizadas mais recentes. Rodadas novas pesam mais; faltar não derruba a nota, e várias partidas na mesma pelada contam como uma amostra semanal.</p>
                  </div>

                  {Number(entry.overallGoalkeeperGames || 0) > 0 && (
                    <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.07] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black uppercase tracking-wide text-cyan-200">🧤 Detalhes do OVR GOL</p>
                        <span className="font-athletic text-lg font-black text-cyan-200">{entry.overallPositions?.GOL.toFixed(1).replace(".", ",")}</span>
                      </div>
                      {entry.goalkeeperStats && (
                        <div className="mt-2">
                          <p className="mb-1 text-[8px] font-black uppercase tracking-wide text-cyan-100/60">Scouts do período exibido</p>
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                            <div className="rounded-lg bg-black/20 p-2 text-center"><strong className="block text-sm text-foreground">{entry.goalkeeperStats.games}</strong><span className="text-[8px] uppercase">jogos no gol</span></div>
                            <div className="rounded-lg bg-black/20 p-2 text-center"><strong className="block text-sm text-foreground">{entry.goalkeeperStats.goalsConceded}</strong><span className="text-[8px] uppercase">gols sofridos</span></div>
                            <div className="rounded-lg bg-black/20 p-2 text-center"><strong className="block text-sm text-foreground">{goalkeeperAverage.toFixed(2).replace(".", ",")}</strong><span className="text-[8px] uppercase">por jogo</span></div>
                            <div className="rounded-lg bg-black/20 p-2 text-center"><strong className="block text-sm text-foreground">{entry.goalkeeperStats.cleanSheets}</strong><span className="text-[8px] uppercase">clean sheets</span></div>
                          </div>
                        </div>
                      )}
                      <p className="mt-2">
                        O OVR GOL só muda em rodadas realmente jogadas no gol: 60% controle de gols sofridos por tempo, 25% jogos sem sofrer, 10% proteção ao longo de todos os horários dos gols e 5% disciplina. A confiança leva 6 rodadas de goleiro para completar e a nota pode variar no máximo 0,8 por rodada.
                      </p>
                      <p className={`mt-1.5 font-bold ${goalkeeperIncluded ? "text-cyan-200" : "text-muted"}`}>
                        {!goalkeeperEligible
                          ? `Ainda não entra no OVR geral: precisa completar 8 partidas em pelo menos 3 rodadas (agora ${goalkeeperGames} partidas em ${goalkeeperRounds} rodadas).`
                          : goalkeeperIncluded
                            ? "Entra no OVR geral porque completou a amostra mínima e está entre as três maiores notas posicionais."
                            : "Já completou a amostra mínima, mas o geral usa DEF/VOL, ATA/ALA e GOL."}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-1.5">
                    <p><strong className="text-foreground">DEF/VOL:</strong> proteção defensiva durante o tempo em campo. O crédito coletivo de clean sheets e poucos gols sofridos diminui conforme o atleta participa de mais gols e assistências; essa produção é direcionada para ATA/ALA.</p>
                    <p><strong className="text-foreground">ATA/ALA:</strong> gols, assistências e proteção coletiva na mesma nota ofensiva.</p>
                    <p><strong className="text-foreground">GOL:</strong> desempenho defensivo nas partidas em que atuou no gol.</p>
                  </div>

                  <p>Gols e assistências são comparados por 7 minutos jogados. A defesa usa gols sofridos por tempo, participação, gols contra e os horários de todos os gols sofridos enquanto o atleta estava em campo.</p>
                  <p className="rounded-lg border border-blue-300/20 bg-blue-300/[0.06] p-2.5"><strong className="text-blue-200">Como o horário pesa:</strong> sem sofrer mantém proteção máxima; depois do primeiro gol a proteção do período cai pela metade; depois do segundo, zera. Por isso, dois gols no fim prejudicam menos o OVR defensivo do que dois gols logo no começo. Quando uma partida antiga não possui horários completos, o sistema usa uma estimativa conservadora.</p>
                  <p className="rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-2.5"><strong className="text-rose-200">Como o sistema separa DEF e ATA:</strong> gols e assistências por tempo jogado aumentam ATA/ALA e retiram parte do crédito defensivo coletivo. Assim, um atacante não recebe DEF alto apenas porque seus gols ajudaram o time a vencer sem sofrer.</p>
                </>
              ) : (
                <div className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-warning">
                  O OVR será calculado após a primeira execução da fórmula, mesmo sem bônus de característica definido pelo administrador.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6 MELHORES PARTIDAS - SANFONA / ACCORDION */}
        {displayedBestRounds && displayedBestRounds.length > 0 && (
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
                      6 Melhores Partidas {scoringMode === "legacy" ? "· Legado" : "· Oficial"}
                    </span>
                    <span className="text-[10px] text-muted">
                      {showBestRounds ? "Toque para recolher" : "Toque para ver os scouts"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-black text-accent">
                    {displayedBestRounds.filter((r) => r.countedInTop6).length}/6 no ranking
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
                  {displayedBestRounds.filter((r) => r.countedInTop6).slice(0, 6).map((round) => (
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
                  {displayedBestRounds.filter((r) => r.countedInTop6).slice(0, 6).map((r, idx) => (
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
                            <p className="mt-0.5 text-[8px] font-bold text-accent/80">
                              {r.playerProfile === "defensive" ? "DEF/VOL" : r.playerProfile === "offensive" ? "ATA/ALA" : "TAG —"}
                              {r.profileDefOverall !== null && r.profileAtaOverall !== null && (
                                <> · OVR DEF {r.profileDefOverall.toFixed(1)} · ATA {r.profileAtaOverall.toFixed(1)}</>
                              )}
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

                          <div className="mb-2 rounded-lg border border-accent/20 bg-black/15 px-2.5 py-2 text-[9px] text-muted">
                            Tag congelada na rodada: <strong className="text-accent">{r.playerProfile === "defensive" ? "DEF/VOL" : r.playerProfile === "offensive" ? "ATA/ALA" : "não registrada"}</strong>.
                            {r.profileDefOverall !== null && r.profileAtaOverall !== null && (
                              <> OVRs disponíveis antes dela: <strong className="text-foreground">DEF {r.profileDefOverall.toFixed(1)} · ATA {r.profileAtaOverall.toFixed(1)}</strong>.</>
                            )}
                            {r.profileDecisionSource === "initial"
                              ? <> A tag inicial teve prioridade nesta {r.profileAppearanceNumber ? `${r.profileAppearanceNumber}ª` : ""} atuação.</>
                              : r.profileDecisionSource === "overall"
                                ? <> Escolha automática pelo maior OVR de linha.</>
                                : null}
                            {r.playerProfile === "offensive" && <> · gols sofridos na linha descontam 0,5, mas não geram bônus defensivo.</>}
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
                  {displayedBestRounds.length >= 6 ? (
                    <span>
                      🎯 <strong className="text-accent">Nota de corte:</strong> Precisa fazer{" "}
                      <strong className="text-accent">&gt; {displayedMinimum} pts</strong> na próxima rodada para subir no ranking.
                    </span>
                  ) : (
                    <span>
                      🎯 <strong className="text-accent">Vagas livres:</strong> {displayedBestRounds.length}/6 jogos. Qualquer pontuação na próxima rodada entrará somando!
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
