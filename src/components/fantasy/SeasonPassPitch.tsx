"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Crown, Sparkles, Users } from "@/components/icons";

export type SeasonStage = {
  id: string;
  name: string;
  shortLabel: string;
  zone: "stands" | "bench" | "field";
  start: number;
  end: number;
  x: number; // Porcentagem no eixo X da imagem (0 a 100)
  y: number; // Porcentagem no eixo Y da imagem (0 a 100)
  reward?: {
    house: number; // Casa exata onde o prêmio é liberado (sempre no número final das duplas)
    title: string;
    description: string;
    icon: string;
    tier: "bronze" | "silver" | "gold" | "diamond" | "legendary";
  };
};

export const SEASON_PASS_STAGES: SeasonStage[] = [
  // 1. ARQUIBANCADA (Casas 1 a 12)
  {
    id: "stand-1",
    name: "Arquibancada · Entrada",
    shortLabel: "1",
    zone: "stands",
    start: 1,
    end: 1,
    x: 13.5,
    y: 11.2,
    reward: {
      house: 1,
      title: "Pacote Bronze de Boas-Vindas",
      description: "Seu primeiro pacote de cartas da temporada!",
      icon: "🎁",
      tier: "bronze",
    },
  },
  { id: "stand-2", name: "Arquibancada", shortLabel: "2", zone: "stands", start: 2, end: 2, x: 28.1, y: 11.2 },
  { id: "stand-3", name: "Arquibancada", shortLabel: "3", zone: "stands", start: 3, end: 3, x: 42.7, y: 11.2 },
  { id: "stand-4", name: "Arquibancada", shortLabel: "4", zone: "stands", start: 4, end: 4, x: 57.3, y: 11.2 },
  {
    id: "stand-5",
    name: "Arquibancada · Marco 5",
    shortLabel: "5",
    zone: "stands",
    start: 5,
    end: 5,
    x: 71.9,
    y: 11.2,
    reward: {
      house: 5,
      title: "Bônus de Cartoletas C$ +5.0",
      description: "Mais caixa para você comprar craques no Cartola.",
      icon: "💰",
      tier: "bronze",
    },
  },
  { id: "stand-6", name: "Arquibancada", shortLabel: "6", zone: "stands", start: 6, end: 6, x: 86.5, y: 11.2 },
  { id: "stand-7", name: "Arquibancada", shortLabel: "7", zone: "stands", start: 7, end: 7, x: 13.5, y: 21.0 },
  { id: "stand-8", name: "Arquibancada", shortLabel: "8", zone: "stands", start: 8, end: 8, x: 28.1, y: 21.0 },
  { id: "stand-9", name: "Arquibancada", shortLabel: "9", zone: "stands", start: 9, end: 9, x: 42.7, y: 21.0 },
  {
    id: "stand-10",
    name: "Arquibancada · Sócio Torcedor",
    shortLabel: "10",
    zone: "stands",
    start: 10,
    end: 10,
    x: 57.3,
    y: 21.0,
    reward: {
      house: 10,
      title: "Pacote de Cartas Prata",
      description: "Cartas táticas para turbinar seu time no Cartola.",
      icon: "📦",
      tier: "silver",
    },
  },
  { id: "stand-11", name: "Arquibancada", shortLabel: "11", zone: "stands", start: 11, end: 11, x: 71.9, y: 21.0 },
  {
    id: "stand-12",
    name: "Arquibancada · Acesso ao Vestiário",
    shortLabel: "12",
    zone: "stands",
    start: 12,
    end: 12,
    x: 86.5,
    y: 21.0,
    reward: {
      house: 12,
      title: "Passe para o Banco de Reservas",
      description: "Você subiu de nível e foi convocado para o banco!",
      icon: "🚪",
      tier: "silver",
    },
  },

  // 2. BANCO DE RESERVAS (Casas 13 a 24)
  { id: "bench-13", name: "Banco de Reservas", shortLabel: "13", zone: "bench", start: 13, end: 13, x: 8.8, y: 39.5 },
  { id: "bench-14", name: "Banco de Reservas", shortLabel: "14", zone: "bench", start: 14, end: 14, x: 19.5, y: 39.5 },
  { id: "bench-15", name: "Banco de Reservas", shortLabel: "15", zone: "bench", start: 15, end: 15, x: 8.8, y: 47.8 },
  {
    id: "bench-16",
    name: "Banco · Aquecimento",
    shortLabel: "16",
    zone: "bench",
    start: 16,
    end: 16,
    x: 19.5,
    y: 47.8,
    reward: {
      house: 16,
      title: "Pacote Prata Especial",
      description: "Mais opções de cartas para sua estratégia.",
      icon: "🥈",
      tier: "silver",
    },
  },
  { id: "bench-17", name: "Banco de Reservas", shortLabel: "17", zone: "bench", start: 17, end: 17, x: 8.8, y: 56.1 },
  { id: "bench-18", name: "Banco de Reservas", shortLabel: "18", zone: "bench", start: 18, end: 18, x: 19.5, y: 56.1 },
  { id: "bench-19", name: "Banco de Reservas", shortLabel: "19", zone: "bench", start: 19, end: 19, x: 8.8, y: 64.4 },
  {
    id: "bench-20",
    name: "Banco · Pronto para Entrar",
    shortLabel: "20",
    zone: "bench",
    start: 20,
    end: 20,
    x: 19.5,
    y: 64.4,
    reward: {
      house: 20,
      title: "Bônus C$ +10.0 + Carta Tática",
      description: "Aumento de patrimônio e reforço de elenco.",
      icon: "📋",
      tier: "gold",
    },
  },
  { id: "bench-21", name: "Banco de Reservas", shortLabel: "21", zone: "bench", start: 21, end: 21, x: 8.8, y: 72.7 },
  { id: "bench-22", name: "Banco de Reservas", shortLabel: "22", zone: "bench", start: 22, end: 22, x: 19.5, y: 72.7 },
  { id: "bench-23", name: "Banco de Reservas", shortLabel: "23", zone: "bench", start: 23, end: 23, x: 8.8, y: 81.0 },
  {
    id: "bench-24",
    name: "Banco · Entrada nos Titulares",
    shortLabel: "24",
    zone: "bench",
    start: 24,
    end: 24,
    x: 19.5,
    y: 81.0,
    reward: {
      house: 24,
      title: "Pacote Ouro Titular",
      description: "Você conquistou a vaga no 11 titular!",
      icon: "⭐",
      tier: "gold",
    },
  },

  // 3. CAMPO DOS TITULARES & LENDA (Casas 25 a 40)
  {
    id: "field-25",
    name: "Goleiro Titular (GOL)",
    shortLabel: "GOL",
    zone: "field",
    start: 25,
    end: 25,
    x: 63.5,
    y: 33.8,
    reward: {
      house: 25,
      title: "Pacote Ouro · Paredão",
      description: "Recompensa por assumir a meta titular.",
      icon: "🧤",
      tier: "gold",
    },
  },
  { id: "field-26", name: "Lateral Direito (LD)", shortLabel: "LD", zone: "field", start: 26, end: 26, x: 36.8, y: 43.8 },
  { id: "field-27", name: "Zagueiro Direito (ZAG)", shortLabel: "ZAG", zone: "field", start: 27, end: 27, x: 54.5, y: 43.8 },
  { id: "field-28", name: "Zagueiro Esquerdo (ZAG)", shortLabel: "ZAG", zone: "field", start: 28, end: 28, x: 72.3, y: 43.8 },
  {
    id: "field-29",
    name: "Lateral Esquerdo (LE) · Muralha",
    shortLabel: "LE",
    zone: "field",
    start: 29,
    end: 29,
    x: 90.0,
    y: 43.8,
    reward: {
      house: 29,
      title: "Carta Rara Defensiva",
      description: "Linha de 4 zagueiros e laterais consolidada!",
      icon: "🛡️",
      tier: "gold",
    },
  },
  {
    id: "field-30-31",
    name: "Volante de Contenção (VOL)",
    shortLabel: "VOL",
    zone: "field",
    start: 30,
    end: 31,
    x: 63.5,
    y: 56.8,
    reward: {
      house: 31, // Prêmio liberado estritamente no número final (31)!
      title: "Pacote Ouro · Cão de Guarda",
      description: "Recompensa desbloqueada ao completar a casa 31.",
      icon: "⚡",
      tier: "gold",
    },
  },
  {
    id: "field-32-33",
    name: "Meia Central / Armador (MC)",
    shortLabel: "MC",
    zone: "field",
    start: 32,
    end: 33,
    x: 49.8,
    y: 67.2,
    reward: {
      house: 33, // Prêmio liberado estritamente no número final (33)!
      title: "Pacote Especial · Criação",
      description: "Recompensa desbloqueada ao completar a casa 33.",
      icon: "🪄",
      tier: "gold",
    },
  },
  {
    id: "field-34",
    name: "Meia Ofensivo / Maestro (MEI)",
    shortLabel: "MEI",
    zone: "field",
    start: 34,
    end: 34,
    x: 77.0,
    y: 67.2,
    reward: {
      house: 34,
      title: "Pacote Diamante do Maestro",
      description: "O cérebro do time! Cartas de altíssima raridade.",
      icon: "🎯",
      tier: "diamond",
    },
  },
  {
    id: "field-35-36",
    name: "Ponta Direita (PD)",
    shortLabel: "PD",
    zone: "field",
    start: 35,
    end: 36,
    x: 39.8,
    y: 79.8,
    reward: {
      house: 36, // Prêmio liberado estritamente no número final (36)!
      title: "Pacote Diamante · Velocidade",
      description: "Recompensa desbloqueada ao completar a casa 36.",
      icon: "🌪️",
      tier: "diamond",
    },
  },
  {
    id: "field-37",
    name: "Centroavante Matador (CA)",
    shortLabel: "CA",
    zone: "field",
    start: 37,
    end: 37,
    x: 63.5,
    y: 79.8,
    reward: {
      house: 37,
      title: "Pacote Especial do Artilheiro",
      description: "O homem gol da temporada!",
      icon: "⚽",
      tier: "diamond",
    },
  },
  {
    id: "field-38-39",
    name: "Ponta Esquerda (PE)",
    shortLabel: "PE",
    zone: "field",
    start: 38,
    end: 39,
    x: 87.0,
    y: 79.8,
    reward: {
      house: 39, // Prêmio liberado estritamente no número final (39)!
      title: "Pacote Diamante · Drible",
      description: "Recompensa desbloqueada ao completar a casa 39.",
      icon: "🚀",
      tier: "diamond",
    },
  },
  {
    id: "field-40",
    name: "LENDA DO FUTEBOL BQ",
    shortLabel: "LENDA",
    zone: "field",
    start: 40,
    end: 40,
    x: 63.5,
    y: 91.2,
    reward: {
      house: 40,
      title: "TROFÉU SUPREMO DA TEMPORADA",
      description: "Badge Dourado de Lenda + Pacote Lendário com as melhores cartas do jogo!",
      icon: "👑",
      tier: "legendary",
    },
  },
];

function getCurrentStage(progress: number): SeasonStage {
  return (
    SEASON_PASS_STAGES.find((s) => progress >= s.start && progress <= s.end) ||
    (progress <= 0 ? SEASON_PASS_STAGES[0] : SEASON_PASS_STAGES[SEASON_PASS_STAGES.length - 1])
  );
}

export function SeasonPassPitch({
  progress,
  playerName,
  playerAvatarUrl,
}: {
  progress: number;
  playerName: string | null;
  playerAvatarUrl: string | null;
}) {
  const currentStage = getCurrentStage(progress);
  const [selectedStageId, setSelectedStageId] = useState<string>(currentStage.id);
  const selectedStage = SEASON_PASS_STAGES.find((s) => s.id === selectedStageId) || currentStage;

  const isCurrent = (s: SeasonStage) => s.id === currentStage.id;
  const isCompleted = (s: SeasonStage) => progress >= s.end;
  const isUnlockedReward = (s: SeasonStage) => s.reward && progress >= s.reward.house;

  return (
    <section className="overflow-hidden rounded-[2.5rem] border border-accent/40 bg-[#051109] p-3 sm:p-4 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in">
      {/* Header com Progresso Geral */}
      <div className="flex items-center justify-between gap-3 px-2 pb-3.5">
        <div>
          <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-accent">
            Tabuleiro Oficial da Temporada
          </span>
          <h2 className="font-athletic text-xl font-black uppercase italic text-white leading-tight">
            {progress === 0 ? "A Jornada Vai Começar" : `${playerName || "Jogador"} · ${currentStage.name}`}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/15 px-3.5 py-2 text-center shadow-lg shadow-accent/20">
          <div>
            <span className="block font-athletic text-2xl font-black text-accent leading-none">{progress}</span>
            <span className="block text-[8px] font-black uppercase tracking-wider text-accent/80">de 40 casas</span>
          </div>
        </div>
      </div>

      {/* TABULEIRO GRÁFICO OFICIAL COM SOBREPOSIÇÃO INTERATIVA */}
      <div className="relative w-full overflow-hidden rounded-[2rem] border-2 border-accent/30 bg-black shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]">
        {/* Imagem de Fundo Oficial */}
        <Image
          src="/images/season-pass-board.jpg"
          alt="Tabuleiro Oficial do Passe de Temporada"
          width={683}
          height={1024}
          sizes="(max-width: 32rem) calc(100vw - 2rem), 30rem"
          className="w-full h-auto block select-none pointer-events-none"
          loading="eager"
        />

        {/* Camada de Hotspots Interativos (Casas 1 a 40) */}
        <div className="absolute inset-0">
          {SEASON_PASS_STAGES.map((stage) => {
            const current = isCurrent(stage);
            const completed = isCompleted(stage);
            const selected = selectedStage.id === stage.id;
            const hasReward = Boolean(stage.reward);
            const rewardClaimed = isUnlockedReward(stage);

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStageId(stage.id)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-transform active:scale-90 ${
                  stage.zone === "stands"
                    ? "w-[9%] aspect-square"
                    : stage.zone === "bench"
                    ? "w-[8.5%] aspect-square"
                    : stage.id === "field-40"
                    ? "w-[15%] aspect-square"
                    : "w-[11.5%] aspect-square"
                }`}
                style={{ left: `${stage.x}%`, top: `${stage.y}%` }}
                aria-label={`${stage.name}, casas ${stage.start} a ${stage.end}`}
              >
                {/* 1. Avatar do Jogador na Casa Atual */}
                {current && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center">
                    <div className="relative h-full w-full rounded-full border-2 border-accent p-0.5 shadow-[0_0_20px_rgba(204,255,0,0.9)] animate-pulse bg-background">
                      {playerAvatarUrl ? (
                        <img
                          src={playerAvatarUrl}
                          alt={playerName || "Jogador"}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-full bg-accent text-[9px] font-black text-background">
                          VOCÊ
                        </div>
                      )}
                      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.2 text-[7px] font-black text-accent border border-accent/40">
                        {stage.start === stage.end ? stage.start : `${stage.start}-${stage.end}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. Selo de Casa Concluída (quando não for a atual) */}
                {completed && !current && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <div className="flex h-[75%] w-[75%] items-center justify-center rounded-full bg-emerald-950/85 border border-emerald-400 text-emerald-400 shadow-md">
                      <CheckCircle2 className="h-[70%] w-[70%]" />
                    </div>
                  </div>
                )}

                {/* 3. Ícone de Recompensa Flutuante */}
                {hasReward && (
                  <div
                    className={`absolute -top-2.5 -right-2.5 z-40 flex h-6 w-6 items-center justify-center rounded-full border shadow-lg transition-transform ${
                      rewardClaimed
                        ? "bg-emerald-500 border-white text-white shadow-[0_0_10px_rgba(16,185,129,0.8)] scale-90"
                        : "bg-black/90 border-yellow-400 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.7)] animate-bounce"
                    }`}
                    title={stage.reward?.title}
                  >
                    <span className="text-[11px] leading-none">{stage.reward?.icon}</span>
                  </div>
                )}

                {/* 4. Indicador de Seleção Ativa ao tocar */}
                {selected && !current && (
                  <div className="absolute inset-0 z-10 rounded-full ring-4 ring-white/60 bg-white/10 animate-ping opacity-75 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CARD DETALHADO DA CASA SELECIONADA */}
      <div className="mt-3.5 rounded-3xl border border-accent/30 bg-gradient-to-r from-[#0c2416] via-[#07170e] to-surface p-4 text-foreground shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border font-athletic text-base font-black ${
                isCurrent(selectedStage)
                  ? "border-accent bg-accent text-background shadow-lg shadow-accent/30"
                  : isCompleted(selectedStage)
                  ? "border-emerald-400 bg-emerald-950/60 text-emerald-300"
                  : "border-white/15 bg-black/40 text-muted"
              }`}
            >
              {selectedStage.shortLabel}
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-muted">
                {selectedStage.zone === "stands"
                  ? "Arquibancada"
                  : selectedStage.zone === "bench"
                  ? "Banco de Reservas"
                  : "Time Titular"}
                {" · "}
                {selectedStage.start === selectedStage.end
                  ? `Casa ${selectedStage.start}`
                  : `Casas ${selectedStage.start} a ${selectedStage.end}`}
              </span>
              <h3 className="font-athletic text-base font-black uppercase italic text-white leading-tight">
                {selectedStage.name}
              </h3>
            </div>
          </div>

          <div className="text-right shrink-0">
            {isCompleted(selectedStage) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="h-3 w-3" /> Concluída
              </span>
            ) : isCurrent(selectedStage) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/25 px-2.5 py-1 text-[9px] font-black uppercase text-accent border border-accent/40 animate-pulse">
                ⚡ Sua Posição
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase text-muted border border-white/10">
                🔒 Bloqueada
              </span>
            )}
          </div>
        </div>

        {/* Detalhe da Recompensa da Casa */}
        {selectedStage.reward ? (
          <div className="mt-3.5 rounded-2xl border border-yellow-400/35 bg-yellow-950/25 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-400/20 text-yellow-300 text-lg shadow-sm">
                {selectedStage.reward.icon}
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xs text-yellow-300">
                    {selectedStage.reward.title}
                  </span>
                  <span className="rounded bg-yellow-400/20 px-1.5 py-0.2 text-[8px] font-black uppercase text-yellow-300">
                    Casa {selectedStage.reward.house}
                  </span>
                </div>
                <p className="text-[11px] text-muted leading-tight mt-0.5">
                  {selectedStage.reward.description}
                </p>
              </div>
            </div>

            <span className="shrink-0 font-athletic text-xs font-black uppercase tracking-wider text-yellow-300">
              {progress >= selectedStage.reward.house ? "Desbloqueado!" : "Em breve"}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted leading-relaxed">
            {isCompleted(selectedStage)
              ? "Você já passou por esta etapa da jornada. Continue jogando para alcançar as próximas casas premiadas!"
              : isCurrent(selectedStage)
              ? "Você está exatamente nesta casa! Escale seu time ou entre em campo na próxima rodada para avançar."
              : "Continue jogando peladas e participando do Cartola para avançar até esta casa."}
          </p>
        )}
      </div>
    </section>
  );
}
