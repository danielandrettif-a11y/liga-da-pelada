import { formatAwardMonth, MONTHLY_AWARD_LABELS, type MonthlyAwardType, type MonthlyAwardWinner } from "@/lib/monthly-awards";

export type MonthlyAwardStoryEntry = {
  type: MonthlyAwardType;
  winner?: MonthlyAwardWinner;
};

const AWARD_COLORS: Record<MonthlyAwardType, { accent: string; background: string; code: string }> = {
  bestDefenderMonth: { accent: "#71d7ff", background: "#0d3040", code: "DEF" },
  bestMidfielderMonth: { accent: "#c8a8ff", background: "#2b1d4b", code: "ALA/MEI" },
  bestAttackerMonth: { accent: "#ff9aad", background: "#491f2a", code: "ATA" },
  bestGoalkeeperMonth: { accent: "#69edff", background: "#0a3942", code: "GOL" },
  goldenBootMonth: { accent: "#ffe16d", background: "#4a3b08", code: "GOLS" },
  topAssistMonth: { accent: "#63edb4", background: "#0b4030", code: "ASSIST" },
  bestManagerMonth: { accent: "#d3ff31", background: "#34450c", code: "TÉC" },
  bestWagMonth: { accent: "#ff9ee9", background: "#4a1744", code: "WAG" },
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "BQ";
}

async function loadImage(url: string | null | undefined) {
  if (!url) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function drawAvatar(context: CanvasRenderingContext2D, image: HTMLImageElement | null, name: string, x: number, y: number, radius: number, accent: string) {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  if (image) {
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 3);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    context.fillStyle = "#12271b";
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.fillStyle = accent;
    context.font = "900 30px Arial";
    context.textAlign = "center";
    context.fillText(initials(name), x, y + 10);
  }
  context.restore();
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.beginPath();
  context.arc(x, y, radius + 2.5, 0, Math.PI * 2);
  context.stroke();
}

export async function createMonthlyAwardsStory(periodStart: string, entries: MonthlyAwardStoryEntry[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");

  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#3d1239");
  background.addColorStop(0.3, "#110e1d");
  background.addColorStop(1, "#04100a");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);

  context.fillStyle = "rgba(255, 224, 102, .13)";
  context.beginPath();
  context.arc(920, 100, 380, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255, 128, 220, .10)";
  context.beginPath();
  context.arc(80, 1590, 360, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(211,255,49,.08)";
  for (let x = 42; x < 1080; x += 44) {
    for (let y = 42; y < 1920; y += 44) {
      context.beginPath();
      context.arc(x, y, 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.textAlign = "center";
  context.fillStyle = "#d3ff31";
  context.font = "900 28px Arial";
  context.fillText("PELADA DE BAIXA QUALIDADE APRESENTA", 540, 92);
  context.fillStyle = "#fff8dc";
  context.font = "italic 900 74px Arial";
  context.fillText("BQ THE BEST", 540, 178);
  context.fillStyle = "#ffd96a";
  context.font = "900 31px Arial";
  context.fillText(`MELHORES DE ${formatAwardMonth(periodStart).toUpperCase()}`, 540, 230);

  context.strokeStyle = "rgba(255,217,106,.48)";
  context.lineWidth = 2;
  roundedRect(context, 62, 275, 956, 1, 1);
  context.stroke();
  context.fillStyle = "rgba(255,255,255,.58)";
  context.font = "900 21px Arial";
  context.fillText("A SELEÇÃO MENSAL DA NOSSA PELADA", 540, 315);

  const cardX = 58;
  const cardWidth = 964;
  const cardHeight = 144;
  const gap = 16;
  const startY = 350;

  const imageByPlayer = new Map<string, HTMLImageElement | null>();
  await Promise.all(entries.map(async (entry) => {
    if (!entry.winner || imageByPlayer.has(entry.winner.playerId)) return;
    imageByPlayer.set(entry.winner.playerId, await loadImage(entry.winner.avatarUrl));
  }));

  entries.forEach((entry, index) => {
    const y = startY + index * (cardHeight + gap);
    const visual = AWARD_COLORS[entry.type];
    const winner = entry.winner;
    const cardGradient = context.createLinearGradient(cardX, y, cardX + cardWidth, y);
    cardGradient.addColorStop(0, visual.background);
    cardGradient.addColorStop(1, "#07130c");
    context.fillStyle = cardGradient;
    roundedRect(context, cardX, y, cardWidth, cardHeight, 26);
    context.fill();
    context.strokeStyle = `${visual.accent}99`;
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = `${visual.accent}24`;
    roundedRect(context, cardX + 18, y + 19, 108, 106, 22);
    context.fill();
    context.strokeStyle = `${visual.accent}99`;
    context.lineWidth = 2;
    context.stroke();
    context.textAlign = "center";
    context.fillStyle = visual.accent;
    context.font = "900 21px Arial";
    context.fillText(visual.code, cardX + 72, y + 83);

    const name = winner?.playerName || "Resultado em breve";
    drawAvatar(context, winner ? imageByPlayer.get(winner.playerId) || null : null, name, cardX + 182, y + 72, 43, visual.accent);
    context.textAlign = "left";
    context.fillStyle = visual.accent;
    context.font = "900 19px Arial";
    context.fillText(MONTHLY_AWARD_LABELS[entry.type].toUpperCase(), cardX + 248, y + 56);
    context.fillStyle = "#ffffff";
    context.font = "900 32px Arial";
    const shortName = name.length > 30 ? `${name.slice(0, 29)}…` : name;
    context.fillText(shortName, cardX + 248, y + 96);
  });

  context.textAlign = "center";
  context.fillStyle = "#d3ff31";
  context.font = "900 24px Arial";
  context.fillText("#BQTHEBEST  •  PELADA DE BAIXA QUALIDADE", 540, 1850);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  if (!blob) throw new Error("Não foi possível gerar a imagem.");
  return blob;
}
