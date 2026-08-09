"use client";

import { jsPDF } from "jspdf";
import type { SeasonPlayerSummary, SeasonSummary } from "./types";

const BRAND_NAME = "Pelada de Baixa Qualidade";
const DARK = "#05100B";
const SURFACE = "#0C1E14";
const ACCENT = "#CCFF00";
const FOREGROUND = "#F8FAFC";
const MUTED = "#82A391";

function playerName(player?: SeasonPlayerSummary) {
  return player ? player.name : "Sem classificação";
}

function fileSlug(summary: SeasonSummary) {
  return `temporada-${summary.seasonNumber}-pelada-de-baixa-qualidade`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function downloadSeasonPdf(summary: SeasonSummary) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  function drawHeader(continuation = false) {
    doc.setFillColor(5, 16, 11);
    doc.rect(0, 0, pageWidth, 44, "F");
    doc.setTextColor(204, 255, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(BRAND_NAME.toUpperCase(), 14, 13);
    doc.setTextColor(248, 250, 252);
    doc.setFontSize(24);
    doc.text(`Temporada ${summary.seasonNumber}`, 14, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(130, 163, 145);
    doc.text(
      continuation
        ? "Continuação do ranking final"
        : `${formatDate(summary.startedAt)} a ${formatDate(summary.endedAt)}`,
      14,
      36,
    );
  }

  drawHeader();

  const overview = [
    ["Rodadas", summary.roundCount],
    ["Partidas", summary.matchCount],
    ["Gols", summary.goalCount],
    ["Jogadores", summary.playerCount],
  ] as const;

  overview.forEach(([label, value], index) => {
    const x = 14 + index * 46;
    doc.setFillColor(239, 245, 241);
    doc.roundedRect(x, 52, 41, 22, 3, 3, "F");
    doc.setTextColor(5, 16, 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(String(value), x + 4, 62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label, x + 4, 69);
  });

  const champion = summary.ranking[0];
  doc.setFillColor(204, 255, 0);
  doc.roundedRect(14, 82, pageWidth - 28, 27, 4, 4, "F");
  doc.setTextColor(5, 16, 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CAMPEÃO DA TEMPORADA", 19, 91);
  doc.setFontSize(17);
  doc.text(playerName(champion), 19, 102);
  if (champion) {
    doc.setFontSize(10);
    doc.text(`${champion.points} pts`, pageWidth - 19, 99, { align: "right" });
  }

  let y = 121;

  function drawTableHeader() {
    doc.setFillColor(12, 30, 20);
    doc.rect(14, y, pageWidth - 28, 9, "F");
    doc.setTextColor(248, 250, 252);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("#", 18, y + 6);
    doc.text("JOGADOR", 27, y + 6);
    doc.text("J", 120, y + 6, { align: "center" });
    doc.text("V", 136, y + 6, { align: "center" });
    doc.text("G", 152, y + 6, { align: "center" });
    doc.text("A", 168, y + 6, { align: "center" });
    doc.text("PTS", 192, y + 6, { align: "right" });
    y += 9;
  }

  drawTableHeader();

  summary.ranking.forEach((player, index) => {
    if (y > pageHeight - 18) {
      doc.addPage();
      drawHeader(true);
      y = 54;
      drawTableHeader();
    }

    if (index % 2 === 0) {
      doc.setFillColor(245, 248, 246);
      doc.rect(14, y, pageWidth - 28, 9, "F");
    }
    doc.setTextColor(20, 35, 27);
    doc.setFont("helvetica", index < 3 ? "bold" : "normal");
    doc.setFontSize(8);
    doc.text(String(index + 1), 18, y + 6);
    const name = playerName(player);
    doc.text(name.length > 35 ? `${name.slice(0, 32)}...` : name, 27, y + 6);
    doc.text(String(player.games), 120, y + 6, { align: "center" });
    doc.text(String(player.wins), 136, y + 6, { align: "center" });
    doc.text(String(player.goals), 152, y + 6, { align: "center" });
    doc.text(String(player.assists), 168, y + 6, { align: "center" });
    doc.text(String(player.points), 192, y + 6, { align: "right" });
    y += 9;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(100, 120, 109);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, pageHeight - 7);
    doc.text(`${page}/${pages}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }

  doc.save(`${fileSlug(summary)}.pdf`);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawCentered(context: CanvasRenderingContext2D, text: string, y: number) {
  context.textAlign = "center";
  context.fillText(text, 540, y);
}

export async function downloadSeasonStory(summary: SeasonSummary) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível gerar a arte.");

  const gradient = context.createLinearGradient(0, 0, 1080, 1920);
  gradient.addColorStop(0, DARK);
  gradient.addColorStop(0.55, "#0A2116");
  gradient.addColorStop(1, "#020805");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1920);

  context.strokeStyle = "rgba(204,255,0,0.08)";
  context.lineWidth = 2;
  for (let x = -500; x < 1400; x += 90) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 900, 1920);
    context.stroke();
  }

  context.fillStyle = ACCENT;
  context.font = "800 32px Arial";
  context.letterSpacing = "4px";
  drawCentered(context, BRAND_NAME.toUpperCase(), 105);

  context.fillStyle = FOREGROUND;
  context.font = "900 94px Arial";
  context.letterSpacing = "0px";
  drawCentered(context, "FIM DE", 245);
  drawCentered(context, `TEMPORADA ${summary.seasonNumber}`, 350);

  context.fillStyle = MUTED;
  context.font = "500 30px Arial";
  drawCentered(context, `${formatDate(summary.startedAt)}  —  ${formatDate(summary.endedAt)}`, 415);

  roundedRect(context, 90, 485, 900, 330, 44);
  context.fillStyle = ACCENT;
  context.fill();
  context.fillStyle = DARK;
  context.font = "800 29px Arial";
  drawCentered(context, "CAMPEÃO DA TEMPORADA", 565);
  context.font = "900 68px Arial";
  const championName = playerName(summary.ranking[0]);
  drawCentered(context, championName.length > 22 ? `${championName.slice(0, 20)}...` : championName, 665);
  context.font = "800 38px Arial";
  drawCentered(context, summary.ranking[0] ? `${summary.ranking[0].points} PONTOS` : "", 745);

  const overview = [
    [String(summary.roundCount), "RODADAS"],
    [String(summary.matchCount), "PARTIDAS"],
    [String(summary.goalCount), "GOLS"],
  ];
  overview.forEach(([value, label], index) => {
    const x = 90 + index * 310;
    roundedRect(context, x, 870, 280, 190, 30);
    context.fillStyle = SURFACE;
    context.fill();
    context.strokeStyle = "rgba(204,255,0,0.22)";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = FOREGROUND;
    context.font = "900 62px Arial";
    context.textAlign = "center";
    context.fillText(value, x + 140, 950);
    context.fillStyle = MUTED;
    context.font = "700 24px Arial";
    context.fillText(label, x + 140, 1010);
  });

  context.fillStyle = FOREGROUND;
  context.font = "900 36px Arial";
  context.textAlign = "left";
  context.fillText("TOP 5 DA TEMPORADA", 90, 1160);

  const topFive = summary.ranking.slice(0, 5);
  topFive.forEach((player, index) => {
    const y = 1210 + index * 112;
    roundedRect(context, 90, y, 900, 88, 22);
    context.fillStyle = index === 0 ? "rgba(204,255,0,0.12)" : "rgba(12,30,20,0.9)";
    context.fill();
    context.fillStyle = index === 0 ? ACCENT : MUTED;
    context.font = "900 34px Arial";
    context.textAlign = "center";
    context.fillText(String(index + 1), 145, y + 57);
    context.fillStyle = FOREGROUND;
    context.font = "800 31px Arial";
    context.textAlign = "left";
    const name = playerName(player);
    context.fillText(name.length > 25 ? `${name.slice(0, 23)}...` : name, 205, y + 56);
    context.fillStyle = index === 0 ? ACCENT : FOREGROUND;
    context.font = "900 31px Arial";
    context.textAlign = "right";
    context.fillText(`${player.points} pts`, 945, y + 56);
  });

  context.fillStyle = MUTED;
  context.font = "600 25px Arial";
  drawCentered(context, `${summary.playerCount} jogadores fizeram parte dessa história`, 1840);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Não foi possível gerar a imagem.");
  downloadBlob(blob, `${fileSlug(summary)}-stories.png`);
}
