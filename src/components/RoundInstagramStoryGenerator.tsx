"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Download,
  Football,
  Image as ImageIcon,
  Share2,
  Sparkles,
  Target,
  Trophy,
  X,
} from "@/components/icons";
import { useDialogViewport } from "@/lib/useDialogViewport";
import type { RoundStatistics } from "@/lib/actions/stats";

type TeamSummary = {
  id: string;
  name: string;
  color: string;
  crest_url?: string | null;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  topScorer?: { name: string; goals: number } | null;
  topAssister?: { name: string; assists: number } | null;
};

export function RoundInstagramStoryGenerator({
  round,
  statistics,
}: {
  round: any;
  statistics?: RoundStatistics | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "preview">("pick");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputGalleryRef = useRef<HTMLInputElement | null>(null);

  useDialogViewport(isOpen);

  // Calcular resumo dos 3 times e destaques de cada time
  const teamsData: TeamSummary[] = (round.teams || []).map((team: any) => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    (round.matches || []).forEach((match: any) => {
      if (match.status !== "finished") return;
      const isTeamA = match.team_a_id === team.id;
      const isTeamB = match.team_b_id === team.id;
      if (!isTeamA && !isTeamB) return;

      const teamScore = isTeamA ? match.team_a_score || 0 : match.team_b_score || 0;
      const opponentScore = isTeamA ? match.team_b_score || 0 : match.team_a_score || 0;

      goalsFor += teamScore;
      goalsAgainst += opponentScore;

      if (teamScore > opponentScore) wins += 1;
      else if (teamScore === opponentScore) draws += 1;
      else losses += 1;
    });

    const points = wins * 3 + draws * 1;

    // Achar artilheiro e garçom do time a partir das estatísticas
    const teamPlayerIds = new Set((team.players || team.team_players || []).map((p: any) => p.player_id || p.id));
    const teamEntries = (statistics?.entries || []).filter((e) => teamPlayerIds.has(e.player.id));

    const sortedScorers = [...teamEntries].filter((e) => e.goals > 0).sort((a, b) => b.goals - a.goals);
    const sortedAssisters = [...teamEntries].filter((e) => e.assists > 0).sort((a, b) => b.assists - a.assists);

    const topScorer = sortedScorers[0] ? { name: sortedScorers[0].player.name, goals: sortedScorers[0].goals } : null;
    const topAssister = sortedAssisters[0] ? { name: sortedAssisters[0].player.name, assists: sortedAssisters[0].assists } : null;

    return {
      id: team.id,
      name: team.name,
      color: team.color || "#CCFF00",
      crest_url: team.crest_url,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      points,
      topScorer,
      topAssister,
    };
  });

  // Ordenar times por pontos -> vitórias -> saldo de gols -> gols pró
  const sortedTeams = [...teamsData].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPhotoUrl(url);
      setStep("preview");
      drawStory(url);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function handleNoPhoto() {
    setPhotoUrl(null);
    setStep("preview");
    drawStory(null);
  }

  function openGenerator() {
    setIsOpen(true);
    setStep("pick");
  }

  async function drawStory(customPhoto?: string | null) {
    const targetPhoto = customPhoto !== undefined ? customPhoto : photoUrl;
    setGenerating(true);
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Fundo (Foto da pelada ou Gradiente de Futebol Escuro)
    ctx.fillStyle = "#05100B";
    ctx.fillRect(0, 0, 1080, 1920);

    if (targetPhoto) {
      await new Promise<void>((resolve) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          // Manter proporção cobrindo todo o canvas
          const hRatio = canvas.width / img.width;
          const vRatio = canvas.height / img.height;
          const ratio = Math.max(hRatio, vRatio);
          const centerShiftX = (canvas.width - img.width * ratio) / 2;
          const centerShiftY = (canvas.height - img.height * ratio) / 2;
          ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = targetPhoto;
      });
    }

    // Overlay escuro com degradê esportivo neon para alto contraste
    const gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    gradient.addColorStop(0, "rgba(5, 16, 11, 0.75)");
    gradient.addColorStop(0.35, "rgba(5, 16, 11, 0.88)");
    gradient.addColorStop(0.85, "rgba(5, 16, 11, 0.96)");
    gradient.addColorStop(1, "rgba(5, 16, 11, 0.99)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // Linhas de design / Mesh esportivo
    ctx.strokeStyle = "rgba(204, 255, 0, 0.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(540, 960, 450, 0, Math.PI * 2);
    ctx.stroke();

    // 2. HEADER
    // Tag superior
    ctx.fillStyle = "#CCFF00";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚽ L I G A   D A   P E L A D A", 540, 150);

    // Título da Rodada
    const roundTitle = round.round_type === "friendly"
      ? `AMISTOSO ${String(round.number).padStart(2, "0")}`
      : `RODADA ${String(round.number).padStart(2, "0")}`;

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "italic 900 86px sans-serif";
    ctx.fillText(roundTitle, 540, 250);

    // Data da Rodada
    const formattedDate = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(`${round.date}T12:00:00`));

    ctx.fillStyle = "#82A391";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(formattedDate.toUpperCase(), 540, 320);

    // 3. TABELA DOS 3 TIMES
    const tableTop = 410;
    const tableWidth = 940;
    const tableLeft = 70;

    // Card da Tabela
    ctx.fillStyle = "rgba(12, 30, 20, 0.85)";
    ctx.strokeStyle = "rgba(204, 255, 0, 0.35)";
    ctx.lineWidth = 3;
    roundRect(ctx, tableLeft, tableTop, tableWidth, 470, 36, true, true);

    // Cabeçalho da Tabela
    ctx.fillStyle = "#CCFF00";
    ctx.font = "italic 900 36px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("CLASSIFICAÇÃO DOS TIMES", tableLeft + 40, tableTop + 65);

    ctx.fillStyle = "#82A391";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("V", tableLeft + 660, tableTop + 65);
    ctx.fillText("SG", tableLeft + 760, tableTop + 65);
    ctx.fillText("PTS", tableLeft + 880, tableTop + 65);

    // Linha divisória
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(tableLeft + 40, tableTop + 90);
    ctx.lineTo(tableLeft + tableWidth - 40, tableTop + 90);
    ctx.stroke();

    // Linhas dos 3 Times
    sortedTeams.forEach((team, idx) => {
      const rowY = tableTop + 160 + idx * 105;
      const isChampion = idx === 0;

      // Posição
      ctx.fillStyle = isChampion ? "#CCFF00" : "#82A391";
      ctx.font = "italic 900 40px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${idx + 1}º`, tableLeft + 40, rowY);

      // Círculo de cor do colete
      ctx.fillStyle = team.color || "#CCFF00";
      ctx.beginPath();
      ctx.arc(tableLeft + 125, rowY - 12, 16, 0, Math.PI * 2);
      ctx.fill();

      // Nome do Time
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 38px sans-serif";
      const truncatedName = team.name.length > 18 ? `${team.name.slice(0, 17)}...` : team.name;
      ctx.fillText(truncatedName, tableLeft + 160, rowY);

      // Estatísticas
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${team.wins}`, tableLeft + 660, rowY);

      const sg = team.goalsFor - team.goalsAgainst;
      ctx.fillStyle = sg > 0 ? "#22C55E" : sg < 0 ? "#EF4444" : "#82A391";
      ctx.fillText(`${sg > 0 ? "+" : ""}${sg}`, tableLeft + 760, rowY);

      ctx.fillStyle = "#CCFF00";
      ctx.font = "italic 900 42px sans-serif";
      ctx.fillText(`${team.points}`, tableLeft + 880, rowY);
    });

    // 4. DESTAQUES DE CADA TIME (ARTILHEIRO & GARÇOM)
    const highlightsTop = 930;
    ctx.fillStyle = "rgba(12, 30, 20, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    roundRect(ctx, tableLeft, highlightsTop, tableWidth, 750, 36, true, true);

    ctx.fillStyle = "#CCFF00";
    ctx.font = "italic 900 36px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("DESTAQUES POR TIME", tableLeft + 40, highlightsTop + 65);

    sortedTeams.forEach((team, idx) => {
      const cardY = highlightsTop + 100 + idx * 210;

      // Sub-card do Time
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.strokeStyle = `${team.color}50`;
      ctx.lineWidth = 2;
      roundRect(ctx, tableLeft + 30, cardY, tableWidth - 60, 185, 24, true, true);

      // Nome do time com tag da cor
      ctx.fillStyle = team.color || "#CCFF00";
      ctx.beginPath();
      ctx.arc(tableLeft + 65, cardY + 42, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(team.name, tableLeft + 90, cardY + 52);

      // Artilheiro do Time
      ctx.fillStyle = "#82A391";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("⚽ Artilheiro:", tableLeft + 60, cardY + 110);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 28px sans-serif";
      const scorerText = team.topScorer ? `${team.topScorer.name} (${team.topScorer.goals} gols)` : "Sem gols registrados";
      ctx.fillText(scorerText, tableLeft + 240, cardY + 110);

      // Garçom do Time
      ctx.fillStyle = "#82A391";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("🎯 Garçom:", tableLeft + 60, cardY + 155);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 28px sans-serif";
      const assistText = team.topAssister ? `${team.topAssister.name} (${team.topAssister.assists} assist.)` : "Sem assistências";
      ctx.fillText(assistText, tableLeft + 240, cardY + 155);
    });

    // 5. FOOTER
    ctx.fillStyle = "#82A391";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Gols, Estatísticas e Resenha · Liga da Pelada", 540, 1780);

    ctx.fillStyle = "#CCFF00";
    ctx.font = "italic 900 32px sans-serif";
    ctx.fillText("antigravity.futebol", 540, 1835);

    setPreviewUrl(canvas.toDataURL("image/png"));
    setGenerating(false);
  }

  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill = true,
    stroke = false
  ) {
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
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  async function handleDownload() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `liga-da-pelada-rodada-${round.number}-story.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleShare() {
    if (!previewUrl) return;
    if (navigator.share) {
      try {
        const blob = await (await fetch(previewUrl)).blob();
        const file = new File([blob], `pelada-rodada-${round.number}.png`, { type: "image/png" });
        await navigator.share({
          title: `Resultados da Rodada ${round.number} - Liga da Pelada`,
          text: `Confira os resultados dos 3 times e artilheiros da rodada! ⚽`,
          files: [file],
        });
      } catch (err) {
        handleDownload();
      }
    } else {
      handleDownload();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openGenerator}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-accent shadow-[0_0_20px_rgba(204,255,0,0.1)] transition-transform hover:bg-accent/20 active:scale-[0.98]"
      >
        <Sparkles className="h-4 w-4" /> Gerar Arte para Instagram Story
      </button>

      {isOpen && (
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-5 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Gerador de Arte para Instagram"
          >
            {/* Fechar */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Inputs Ocultos de Câmera e Galeria */}
            <input
              ref={fileInputCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelected}
              className="hidden"
            />
            <input
              ref={fileInputGalleryRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />

            {/* ETAPA 1: ESCOLHER FOTO / FUNDO */}
            {step === "pick" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-athletic text-lg font-black uppercase italic tracking-wide text-foreground">
                      Arte do Instagram
                    </h2>
                    <p className="text-[11px] text-muted">
                      Escolha a imagem de fundo para os resultados:
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputCameraRef.current?.click()}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-accent/40 bg-accent/10 p-3.5 text-left transition-all hover:bg-accent/20 active:scale-[0.98]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-background shadow-md">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-wide text-foreground">
                        Tirar Foto Agora
                      </p>
                      <p className="text-[10px] text-muted">
                        Abra a câmera e fotografe a resenha
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputGalleryRef.current?.click()}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5 text-left transition-all hover:border-accent/40 hover:bg-surface-hover active:scale-[0.98]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-wide text-foreground">
                        Escolher da Galeria
                      </p>
                      <p className="text-[10px] text-muted">
                        Selecione uma foto já salva no celular
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleNoPhoto}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-black/20 p-3 text-left transition-all hover:border-border hover:bg-surface active:scale-[0.98]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted">
                      <Football className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-foreground">
                        Fundo Oficial da Liga
                      </p>
                      <p className="text-[9px] text-muted">
                        Gerar direto com o design Neon padrão
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              /* ETAPA 2: PRÉVIA E COMPARTILHAMENTO */
              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <h2 className="font-athletic text-sm font-black uppercase italic tracking-wide text-foreground">
                      Prévia do Story
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("pick")}
                    className="text-[10px] font-bold text-accent hover:underline"
                  >
                    Trocar foto
                  </button>
                </div>

                {/* Preview do Story */}
                <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-2 max-h-[45vh]">
                  {generating ? (
                    <div className="py-16 text-center text-xs font-bold text-muted animate-pulse">
                      Desenhando arte em alta resolução...
                    </div>
                  ) : previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Prévia da arte para Instagram"
                      className="max-h-[40vh] w-auto rounded-xl object-contain shadow-2xl"
                    />
                  ) : (
                    <div className="py-16 text-center text-xs text-muted">Nenhuma prévia disponível</div>
                  )}
                </div>

                {/* Ações */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={generating || !previewUrl}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" /> Baixar
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    disabled={generating || !previewUrl}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 py-3 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                  >
                    <Share2 className="h-4 w-4" /> Compartilhar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
