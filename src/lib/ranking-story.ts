import type { RankingEntry } from "@/lib/ranking";
import { getInitials } from "@/lib/utils";

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

export async function createPodiumStory(
  podium: RankingEntry[],
  seasonLabel: string,
  rankingLabel: string,
  periodTitle: string,
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
  ctx.fillText(periodTitle, 540, 235);
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
