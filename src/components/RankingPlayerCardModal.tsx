"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Medal, Share2, Sparkles, Target, Trophy, X } from "@/components/icons";
import type { RankingEntry } from "@/lib/ranking";
import { PlayerAvatar } from "./PlayerAvatar";
import { CosmeticNameplate } from "./fantasy/CosmeticNameplate";
import { getInitials } from "@/lib/utils";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  entry: RankingEntry;
  position: number;
  onClose: () => void;
};

const PROFILE_LABELS = {
  offensive: "ATA",
  midfield: "MEI/ALA",
  defensive: "DEF",
};

function cardTheme(position: number) {
  if (position === 1) return { artwork: "/images/ranking-cards/ranking-card-gold-v1.webp", base: "#c99520", light: "#fff0a6", deep: "#6f4806", edge: "#ffe77a", ink: "#ffffff", glow: "rgba(255,199,47,.42)", label: "OURO" };
  if (position === 2) return { artwork: "/images/ranking-cards/ranking-card-silver-v1.webp", base: "#a8b1bd", light: "#f8fbff", deep: "#515b68", edge: "#e8f1f8", ink: "#ffffff", glow: "rgba(210,224,240,.35)", label: "PRATA" };
  if (position === 3) return { artwork: "/images/ranking-cards/ranking-card-bronze-v1.webp", base: "#a9612f", light: "#f0c09a", deep: "#512713", edge: "#efad77", ink: "#ffffff", glow: "rgba(195,105,53,.38)", label: "BRONZE" };
  return { artwork: "/images/ranking-cards/ranking-card-neutral-v1.webp", base: "#123e28", light: "#4f8d67", deep: "#06150d", edge: "#ccff00", ink: "#ffffff", glow: "rgba(204,255,0,.2)", label: "RANKED" };
}

function cardLayout(position: number) {
  if (position === 1) return {
    header: "inset-x-[29%] top-[9.2%] h-[4.3%]",
    hero: "inset-x-[14.5%] top-[16%] h-[31.5%]",
    score: "left-0 top-[6%] w-[38%]",
    portrait: "right-[1%] top-[3%] w-[48%]",
    image: "object-[center_18%]",
    name: "inset-x-[13.5%] top-[49.3%] h-[8.2%]",
    awards: "inset-x-[21%] top-[59.1%] h-[4.8%]",
    stats: "inset-x-[18.5%] bottom-[9.5%] top-[65.7%]",
  };
  if (position === 2) return {
    header: "inset-x-[28%] top-[11.6%] h-[4.2%]",
    hero: "inset-x-[14%] top-[17%] h-[34%]",
    score: "left-0 top-[5%] w-[38%]",
    portrait: "right-[2%] top-[5%] w-[44%]",
    image: "object-[center_22%]",
    name: "inset-x-[10.5%] top-[55.2%] h-[8.3%]",
    awards: "inset-x-[17%] top-[65.2%] h-[5.1%]",
    stats: "inset-x-[15%] bottom-[8.7%] top-[72.8%]",
  };
  if (position === 3) return {
    header: "inset-x-[30%] top-[8.1%] h-[4.1%]",
    hero: "inset-x-[13.5%] top-[15%] h-[35%]",
    score: "left-[1%] top-[6%] w-[38%]",
    portrait: "right-[2%] top-[6%] w-[44%]",
    image: "object-[center_18%]",
    name: "inset-x-[10.5%] top-[51.8%] h-[8.5%]",
    awards: "inset-x-[17%] top-[62.1%] h-[5.2%]",
    stats: "inset-x-[16.5%] bottom-[12.4%] top-[69.5%]",
  };
  return {
    header: "inset-x-[30%] top-[8%] h-[4%]",
    hero: "inset-x-[14%] top-[15.5%] h-[35%]",
    score: "left-0 top-[7%] w-[38%]",
    portrait: "right-[3%] top-[6%] w-[43%]",
    image: "object-[center_18%]",
    name: "inset-x-[10.5%] top-[53.5%] h-[8.4%]",
    awards: "inset-x-[17%] top-[63.7%] h-[5%]",
    stats: "inset-x-[15%] bottom-[9.8%] top-[70%]",
  };
}

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

async function createPlayerStory(entry: RankingEntry, position: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  const theme = cardTheme(position);
  const profile = `${PROFILE_LABELS[entry.player.player_profile || "midfield"]}${entry.player.is_goalkeeper ? " / GOL" : ""}`;
  const cardArtwork = await loadShareImage(theme.artwork);

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

  const x = 95, y = 225, width = 890, height = 1450;
  if (cardArtwork) {
    context.drawImage(cardArtwork, x, y, width, height);
  } else {
    context.save();
    roundedRect(context, x, y, width, height, 70);
    context.clip();
    const cardGradient = context.createLinearGradient(x, y, x + width, y + height);
    cardGradient.addColorStop(0, theme.light);
    cardGradient.addColorStop(0.48, theme.base);
    cardGradient.addColorStop(1, theme.deep);
    context.fillStyle = cardGradient;
    context.fillRect(x, y, width, height);
    context.restore();
  }

  context.textAlign = "left";
  context.fillStyle = theme.ink;
  context.font = "900 118px Arial";
  context.fillText(String(entry.points), 155, 420);
  context.font = "900 30px Arial";
  context.fillText("PTS", 170, 462);
  context.font = "900 36px Arial";
  context.fillText(profile, 150, 525);
  context.font = "900 24px Arial";
  context.fillText(`${position}º NO RANKING`, 150, 572);

  const avatar = await loadShareImage(entry.player.avatar_url);
  const avatarX = 660, avatarY = 465, avatarRadius = 205;
  context.save();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  context.clip();
  if (avatar) {
    const scale = Math.max((avatarRadius * 2) / avatar.width, (avatarRadius * 2) / avatar.height);
    const drawWidth = avatar.width * scale;
    const drawHeight = avatar.height * scale;
    context.drawImage(avatar, avatarX - drawWidth / 2, avatarY - drawHeight / 2, drawWidth, drawHeight);
  } else {
    context.fillStyle = "rgba(0,0,0,.28)";
    context.fillRect(avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    context.fillStyle = theme.ink;
    context.textAlign = "center";
    context.font = "900 100px Arial";
    context.fillText(getInitials(entry.player.name), avatarX, avatarY + 34);
  }
  context.restore();
  context.strokeStyle = theme.edge;
  context.lineWidth = 8;
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "rgba(0,0,0,.18)";
  roundedRect(context, 145, 985, 790, 125, 24);
  context.fill();
  context.fillStyle = theme.ink;
  context.textAlign = "center";
  context.font = "900 56px Arial";
  const displayName = entry.player.name.toUpperCase();
  context.fillText(displayName.length > 25 ? `${displayName.slice(0, 24)}…` : displayName, 540, 1050);

  const stats: Array<[string | number, string]> = [
    [entry.goals, "GOLS"], [entry.assists, "ASSIST."], [entry.wins, "VITÓRIAS"],
    [entry.games, "JOGOS"], [entry.losses, "DERROTAS"], [`${entry.winRate}%`, "APROV."],
  ];
  stats.forEach(([value, label], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const boxX = 145 + col * 270;
    const boxY = 1210 + row * 145;
    context.fillStyle = "rgba(0,0,0,.08)";
    roundedRect(context, boxX, boxY, 245, 125, 20);
    context.fill();
    context.fillStyle = theme.ink;
    context.font = "900 65px Arial";
    context.fillText(String(value), boxX + 122, boxY + 58);
    context.font = "900 20px Arial";
    context.fillText(label, boxX + 122, boxY + 94);
  });

  const awards = [
    entry.awards.topScorer ? `ARTILHEIRO ${entry.awards.topScorer}x` : "",
    entry.awards.topAssister ? `GARÇOM ${entry.awards.topAssister}x` : "",
    entry.awards.bestGoalkeeper ? `GOLEIRO ${entry.awards.bestGoalkeeper}x` : "",
    entry.awards.bestDefender ? `XERIFE ${entry.awards.bestDefender}x` : "",
  ].filter(Boolean).join("  •  ");
  if (awards) {
    context.fillStyle = theme.ink;
    context.font = "900 21px Arial";
    context.fillText(awards, 540, 1145, 780);
  }
  context.fillStyle = "rgba(255,255,255,.15)";
  roundedRect(context, 145, 1515, 790, 70, 20);
  context.fill();
  context.fillStyle = theme.ink;
  context.font = "900 25px Arial";
  context.fillText("FUTEBOL, RESENHA E BAIXA QUALIDADE", 540, 1560);

  context.fillStyle = "#ffffff";
  context.font = "900 31px Arial";
  context.fillText("COMPARTILHE SUA CARTA", 540, 1782);
  context.fillStyle = "#91a498";
  context.font = "700 22px Arial";
  context.fillText("pelada-de-baixa-qualidade", 540, 1828);

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

  const theme = cardTheme(position);
  const layout = cardLayout(position);
  const displayName = entry.player.name;
  const profile = `${PROFILE_LABELS[entry.player.player_profile || "midfield"]}${entry.player.is_goalkeeper ? " / GOL" : ""}`;
  const awardBadges = [
    { label: "Artilheiro", value: entry.awards.topScorer, Icon: Target },
    { label: "Garçom", value: entry.awards.topAssister, Icon: Sparkles },
    { label: "Goleiro", value: entry.awards.bestGoalkeeper, Icon: Medal },
    { label: "Xerife", value: entry.awards.bestDefender, Icon: Medal },
  ].filter((award) => award.value > 0);
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

          <header className={`absolute z-10 flex items-center justify-center truncate text-[8px] font-black uppercase tracking-[.16em] ${layout.header}`} style={{ color: theme.edge }}>
            PBQ • {theme.label}
          </header>

          <div className={`absolute z-10 ${layout.hero}`}>
            <div className={`absolute flex flex-col items-start pl-1 font-athletic drop-shadow-[0_2px_5px_rgba(0,0,0,.9)] ${layout.score}`}>
              <span className="player-card-rating text-[2.65rem] font-black leading-none" style={{ color: theme.edge }}>{entry.points}</span>
              <span className="mt-0.5 text-[9px] font-black tracking-[.22em] text-white/75">PTS</span>
              <span className="mt-2 border-t border-white/30 pt-2 text-[11px] font-black uppercase leading-tight text-white">{profile}</span>
              <span className="mt-2 rounded-md border border-white/25 bg-black/35 px-2 py-0.5 text-xs font-black text-white">{position}º</span>
            </div>
            <div className={`absolute aspect-square ${layout.portrait}`}>
              <PlayerAvatar
                name={entry.player.name}
                avatarUrl={entry.player.avatar_url}
                clickable={false}
                className="h-full w-full overflow-hidden rounded-full border-[3px] bg-[#07150d] text-2xl font-black shadow-[0_10px_28px_rgba(0,0,0,.55)]"
                imageClassName={`h-full w-full object-cover ${layout.image}`}
                frameKey={null}
                auraKey={null}
                frameClass=""
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border border-white/30" style={{ boxShadow: `inset 0 0 0 2px ${theme.edge}, 0 0 16px ${theme.glow}` }} />
            </div>
          </div>

          <div className={`absolute z-10 flex items-center justify-center px-1 text-center ${layout.name}`}>
            {entry.cosmetics?.nameplateKey ? (
              <CosmeticNameplate assetKey={entry.cosmetics.nameplateKey} playerName={displayName} titleName={entry.cosmetics.titleName} compact className="ranking-card-nameplate h-full w-full max-w-none" />
            ) : (
              <div className="flex h-full min-w-0 w-full flex-col items-center justify-center px-[7%]">
                <h2 className={`ranking-card-player-name font-athletic font-black uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.9)] ${displayName.length > 22 ? "text-sm leading-[.9] tracking-normal" : displayName.length > 15 ? "text-base leading-none tracking-tight" : "text-xl leading-none tracking-wide"}`}>{displayName}</h2>
                {entry.cosmetics?.titleName && <p className="mt-0.5 max-w-full truncate text-[7px] font-black uppercase tracking-[.13em]" style={{ color: theme.edge }}>✦ {entry.cosmetics.titleName}</p>}
              </div>
            )}
          </div>

          <div className={`absolute z-10 grid grid-cols-2 gap-[9%] text-center ${layout.awards}`}>
            {awardBadges.length > 0 ? awardBadges.slice(0, 2).map(({ label, value, Icon }) => (
              <span key={label} className="flex min-w-0 items-center justify-center gap-1 truncate text-[7px] font-black uppercase text-white">
                <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: theme.edge }} /> {label} {value}x
              </span>
            )) : <span className="col-span-2 self-center text-[7px] font-black uppercase tracking-[.18em] text-white/55">Futebol • Resenha • PBQ</span>}
          </div>

          <div className={`absolute z-10 grid grid-cols-3 grid-rows-2 font-athletic ${layout.stats}`}>
            {[[entry.goals, "GOL"], [entry.assists, "AST"], [entry.wins, "VIT"], [entry.games, "JOG"], [entry.losses, "DER"], [`${entry.winRate}%`, "APR"]].map(([value, label]) => (
              <div key={label} className="flex flex-col items-center justify-center text-center">
                <p className="player-card-number text-xl leading-none text-white drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]">{value}</p>
                <p className="mt-1 text-[7px] font-black tracking-[.14em] text-white/65">{label}</p>
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
