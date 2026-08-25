"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Medal, Share2, Sparkles, Target, Trophy, X } from "@/components/icons";
import type { RankingEntry } from "@/lib/ranking";
import { PlayerAvatar } from "./PlayerAvatar";
import { getInitials } from "@/lib/utils";

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
  if (position === 1) return { base: "#c99520", light: "#fff0a6", deep: "#6f4806", edge: "#fff5bd", ink: "#2d2106", glow: "rgba(255,199,47,.42)", label: "OURO" };
  if (position === 2) return { base: "#a8b1bd", light: "#f8fbff", deep: "#515b68", edge: "#ffffff", ink: "#17202a", glow: "rgba(210,224,240,.35)", label: "PRATA" };
  if (position === 3) return { base: "#a9612f", light: "#f0c09a", deep: "#512713", edge: "#f4c8a6", ink: "#2c150a", glow: "rgba(195,105,53,.38)", label: "BRONZE" };
  return { base: "#123e28", light: "#4f8d67", deep: "#06150d", edge: "#bdfb68", ink: "#f7fff9", glow: "rgba(204,255,0,.2)", label: "ESPECIAL" };
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
  context.save();
  roundedRect(context, x, y, width, height, 70);
  context.clip();
  const cardGradient = context.createLinearGradient(x, y, x + width, y + height);
  cardGradient.addColorStop(0, theme.light);
  cardGradient.addColorStop(0.48, theme.base);
  cardGradient.addColorStop(1, theme.deep);
  context.fillStyle = cardGradient;
  context.fillRect(x, y, width, height);
  context.fillStyle = "rgba(255,255,255,.12)";
  for (let stripe = -800; stripe < 1200; stripe += 95) {
    context.save();
    context.translate(x + stripe, y);
    context.rotate(-0.22);
    context.fillRect(0, 0, 20, 1700);
    context.restore();
  }
  context.restore();
  context.strokeStyle = theme.edge;
  context.lineWidth = 9;
  roundedRect(context, x, y, width, height, 70);
  context.stroke();

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

  context.fillStyle = "rgba(255,255,255,.16)";
  roundedRect(context, 145, 710, 790, 125, 24);
  context.fill();
  context.fillStyle = theme.ink;
  context.textAlign = "center";
  context.font = "900 56px Arial";
  const displayName = entry.player.name.toUpperCase();
  context.fillText(displayName.length > 25 ? `${displayName.slice(0, 24)}…` : displayName, 540, 790);

  const stats: Array<[string | number, string]> = [
    [entry.goals, "GOLS"], [entry.assists, "ASSIST."], [entry.wins, "VITÓRIAS"],
    [entry.games, "JOGOS"], [entry.losses, "DERROTAS"], [`${entry.winRate}%`, "APROV."],
  ];
  stats.forEach(([value, label], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const boxX = 145 + col * 270;
    const boxY = 900 + row * 225;
    context.fillStyle = "rgba(255,255,255,.14)";
    roundedRect(context, boxX, boxY, 245, 190, 24);
    context.fill();
    context.fillStyle = theme.ink;
    context.font = "900 65px Arial";
    context.fillText(String(value), boxX + 122, boxY + 82);
    context.font = "900 20px Arial";
    context.fillText(label, boxX + 122, boxY + 132);
  });

  const awards = [
    entry.awards.topScorer ? `ARTILHEIRO ${entry.awards.topScorer}x` : "",
    entry.awards.topAssister ? `GARÇOM ${entry.awards.topAssister}x` : "",
    entry.awards.bestGoalkeeper ? `GOLEIRO ${entry.awards.bestGoalkeeper}x` : "",
  ].filter(Boolean).join("  •  ");
  if (awards) {
    context.fillStyle = theme.ink;
    context.font = "900 21px Arial";
    context.fillText(awards, 540, 1422);
  }
  context.fillStyle = "rgba(255,255,255,.15)";
  roundedRect(context, 145, 1480, 790, 105, 24);
  context.fill();
  context.fillStyle = theme.ink;
  context.font = "900 25px Arial";
  context.fillText("FUTEBOL, RESENHA E BAIXA QUALIDADE", 540, 1545);

  context.fillStyle = "#ffffff";
  context.font = "900 31px Arial";
  context.fillText("COMPARTILHE SUA CARTA", 540, 1782);
  context.fillStyle = "#91a498";
  context.font = "700 22px Arial";
  context.fillText("pelada-de-baixa-qualidade", 540, 1828);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem.")), "image/png", 0.95));
}

export function RankingPlayerCardModal({ entry, position, onClose }: Props) {
  const theme = cardTheme(position);
  const displayName = entry.player.name;
  const profile = `${PROFILE_LABELS[entry.player.player_profile || "midfield"]}${entry.player.is_goalkeeper ? " / GOL" : ""}`;
  const awardBadges = [
    { label: "Artilheiro", value: entry.awards.topScorer, Icon: Target },
    { label: "Garçom", value: entry.awards.topAssister, Icon: Sparkles },
    { label: "Goleiro", value: entry.awards.bestGoalkeeper, Icon: Medal },
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
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const clipPath = "polygon(10% 0, 90% 0, 100% 7%, 97% 88%, 50% 100%, 3% 88%, 0 7%)";

  return (
    <div className="mobile-dialog-backdrop bg-black/90 backdrop-blur-md" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Carta de ${displayName}`} className="relative w-full max-w-[350px] py-12">
        <button type="button" onClick={onClose} aria-label="Fechar carta" className="absolute right-1 top-1 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur hover:bg-black/90">
          <X className="h-5 w-5" />
        </button>

        <div className="relative p-[3px]" style={{ clipPath, background: `linear-gradient(145deg, ${theme.edge}, ${theme.deep} 48%, ${theme.light})`, filter: `drop-shadow(0 26px 36px ${theme.glow})` }}>
          <div className="relative overflow-hidden px-6 pb-12 pt-6" style={{ clipPath, color: theme.ink, background: `linear-gradient(155deg, ${theme.light} 0%, ${theme.base} 42%, ${theme.deep} 115%)` }}>
            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(120deg, transparent 0 22px, rgba(255,255,255,.2) 23px 24px), radial-gradient(circle at 72% 14%, rgba(255,255,255,.85), transparent 28%)" }} />
            <div className="pointer-events-none absolute -left-16 top-32 h-32 w-[140%] -rotate-12 border-y border-white/25 bg-white/10" />
            <div className="pointer-events-none absolute inset-3 border border-current/20" style={{ clipPath }} />

            <header className="relative z-10 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.22em]">
              <span>PBQ · Temporada</span>
              <span className="rounded-full border border-current/25 bg-white/15 px-2.5 py-1">Carta {theme.label}</span>
            </header>

            <div className="relative z-10 mt-2 h-52">
              <div className="absolute left-0 top-5 z-20 flex w-20 flex-col items-center font-athletic">
                <span className="player-card-rating text-6xl">{entry.points}</span>
                <span className="-mt-1 text-xs font-black tracking-[0.25em]">PTS</span>
                <div className="my-2 h-px w-12 bg-current opacity-30" />
                <span className="text-center text-xl font-black leading-5">{profile}</span>
                <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-full border border-current/25 bg-white/15 shadow-inner">
                  <Trophy className="h-6 w-6" fill="currentColor" />
                </div>
              </div>

              <div className="absolute -right-5 bottom-0 h-52 w-56">
                <div className="absolute inset-x-5 bottom-1 h-10 rounded-full bg-black/35 blur-xl" />
                <PlayerAvatar name={entry.player.name} avatarUrl={entry.player.avatar_url} className="relative h-full w-full bg-transparent text-6xl font-black" imageClassName="object-cover object-top" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: `linear-gradient(transparent, ${theme.base})` }} />
              </div>

              <div className="absolute bottom-1 left-0 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-current/25 bg-white/15 font-athletic text-sm font-black">{position}º</div>
            </div>

            <div className="relative z-10 -mt-1 border-y border-current/30 bg-white/10 px-2 py-3 text-center backdrop-blur-sm">
              <h2 className="truncate font-athletic text-2xl font-black uppercase tracking-wide">{displayName}</h2>
              {entry.player.nickname && <p className="mt-0.5 truncate text-[10px] font-bold italic opacity-75">“{entry.player.nickname}”</p>}
            </div>

            <div className="relative z-10 mt-4 grid grid-cols-3 gap-x-2 gap-y-3 font-athletic">
              {[
                [entry.goals, "GOL"], [entry.assists, "AST"], [entry.wins, "VIT"],
                [entry.games, "JOG"], [entry.losses, "DER"], [`${entry.winRate}%`, "APR"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-current/15 bg-white/10 px-1 py-2 text-center shadow-inner">
                  <p className="player-card-number text-2xl">{value}</p>
                  <p className="mt-1 text-[9px] font-black tracking-[0.18em] opacity-70">{label}</p>
                </div>
              ))}
            </div>

            {awardBadges.length > 0 && (
              <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-1.5">
                {awardBadges.map(({ label, value, Icon }) => <span key={label} className="inline-flex items-center gap-1 rounded-full border border-current/20 bg-white/15 px-2 py-1 text-[8px] font-black uppercase"><Icon className="h-3 w-3" />{label} {value}x</span>)}
              </div>
            )}

            {entry.fitness && (
              <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 border-t border-current/25 pt-3 text-center">
                <div><p className="font-athletic text-lg font-black">{entry.fitness.distanceKm} km</p><p className="text-[8px] font-black uppercase opacity-65">Distância Ranked</p></div>
                <div><p className="font-athletic text-lg font-black">{entry.fitness.averageSpeedKmh} km/h</p><p className="text-[8px] font-black uppercase opacity-65">Velocidade média</p></div>
              </div>
            )}
          </div>
        </div>

        {entry.bestRounds && entry.bestRounds.length > 0 && (
          <div className="mx-auto mt-4 w-[92%] overflow-hidden rounded-2xl border border-border bg-[#07150d]/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-accent" />
                <span className="font-athletic text-xs font-black uppercase tracking-wider text-foreground">
                  Suas 6 Melhores Partidas
                </span>
              </div>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-black text-accent">
                {entry.bestRounds.filter((r) => r.countedInTop6).length}/6 no ranking
              </span>
            </div>

            {/* Lista de Partidas */}
            <div className="mt-3 divide-y divide-border/40 max-h-48 overflow-y-auto">
              {entry.bestRounds.map((r, idx) => (
                <div
                  key={r.roundId}
                  className={`flex items-center justify-between py-2 px-1 text-xs transition-colors ${
                    r.countedInTop6 ? "text-foreground" : "text-muted opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                        r.countedInTop6
                          ? "bg-accent text-background font-bold"
                          : "bg-surface text-muted"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <p className="font-bold truncate text-[11px]">
                        Rodada {String(r.roundNumber).padStart(2, "0")}
                      </p>
                      <p className="text-[9px] text-muted">
                        {r.goals}G · {r.assists}A · {r.wins}V
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-athletic text-base font-black ${
                        r.countedInTop6 ? "text-accent" : "text-muted"
                      }`}
                    >
                      {r.points} pts
                    </span>
                    {r.countedInTop6 && (
                      <span className="block text-[8px] font-bold text-accent/80 uppercase">
                        Somando
                      </span>
                    )}
                  </div>
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

        <div className="mx-auto mt-4 grid w-[88%] gap-2">
          <button type="button" onClick={shareCard} disabled={sharing} className="flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 py-3.5 text-sm font-black uppercase tracking-wide text-accent disabled:opacity-50"><Share2 className="h-4 w-4" />{sharing ? "Gerando Stories..." : "Compartilhar carta"}</button>
          <Link href={`/jogadores/${entry.player.id}`} className="flex items-center justify-center rounded-xl bg-accent py-3.5 text-sm font-black uppercase tracking-wide text-background shadow-lg shadow-accent/15">Abrir perfil completo</Link>
          {shareError && <p className="rounded-lg bg-danger/10 p-2 text-center text-[10px] font-bold text-danger">{shareError}</p>}
        </div>
      </div>
    </div>
  );
}
