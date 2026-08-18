"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Sparkles } from "@/components/icons";

type Props = {
  roundNumber?: number;
  onStart: () => void;
  onComplete: () => void;
};

export function PackVideoOpening({ roundNumber, onStart, onComplete }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasTriggeredStart = useRef(false);

  function handleStartOpening() {
    if (isPlaying) return;
    setIsPlaying(true);

    if (!hasTriggeredStart.current) {
      hasTriggeredStart.current = true;
      onStart();
    }

    // Tenta reproduzir o vídeo
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {
          // Se o autoplay for bloqueado pelo navegador, avança suavemente
          setTimeout(onComplete, 1200);
        });
      }
    }, 50);
  }

  function handleVideoEnded() {
    // Pequeno delay suave de 200ms após o término do vídeo para as cartas surgirem
    setTimeout(onComplete, 200);
  }

  return (
    <div className="flex flex-col items-center justify-center py-2 select-none">
      {!isPlaying ? (
        /* ESTADO INICIAL: PACOTE OFICIAL FLUTUANDO (LEVITATING) */
        <div className="flex flex-col items-center text-center space-y-4 py-2 w-full animate-fade-in">
          <div>
            <span className="font-athletic text-[11px] font-black uppercase italic tracking-[0.2em] text-amber-300 flex items-center justify-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Recompensa de Participação
            </span>
            <h2 className="mt-1 font-athletic text-2xl sm:text-3xl font-black uppercase italic text-white drop-shadow-lg">
              {roundNumber ? `Pacote da Rodada ${String(roundNumber).padStart(2, "0")}` : "Pacote da Rodada"}
            </h2>
            <p className="mt-1 text-xs text-muted max-w-xs mx-auto">
              Abra seu pacote oficial BQ para sortear 2 cartas especiais e escolher 1 para o seu time.
            </p>
          </div>

          {/* FIGURA REAL DO PACOTE BQ FLUTUANDO (MEXE PRA CIMA E PRA BAIXO) */}
          <div
            onClick={handleStartOpening}
            className="group relative cursor-pointer flex flex-col items-center justify-center py-3 my-2"
          >
            {/* Halo de iluminação de fundo */}
            <div className="pointer-events-none absolute h-52 w-52 rounded-full bg-accent/20 blur-3xl animate-pulse" />
            <div className="pointer-events-none absolute h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" />

            {/* Imagem do Pacote com Efeito de Levitação */}
            <div className="relative w-48 h-72 sm:w-56 sm:h-84 animate-pack-levitate transition-transform duration-300 group-hover:scale-105 active:scale-95">
              <Image
                src="/images/pack-cover.png"
                alt="Pacote Oficial BQ"
                fill
                priority
                className="object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.9)]"
              />
            </div>

            {/* Indicador sutil de toque */}
            <span className="mt-2 font-athletic text-xs font-black uppercase italic tracking-widest text-accent group-hover:text-amber-300 transition-colors drop-shadow-md flex items-center gap-1">
              <span>Toque no pacote para abrir</span>
              <span className="text-sm">✨</span>
            </span>
          </div>

          {/* BOTÃO PRINCIPAL DE ABERTURA */}
          <button
            type="button"
            onClick={handleStartOpening}
            className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 py-4 text-xs font-black uppercase tracking-wider text-[#05130b] shadow-[0_0_35px_rgba(245,158,11,0.45)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>Abrir Pacote Agora</span>
            <span className="text-base">✨</span>
          </button>
        </div>
      ) : (
        /* ESTADO EM REPRODUÇÃO: VÍDEO CINEMATOGRÁFICO DE ABERTURA BQ */
        <div className="relative w-full max-w-sm sm:max-w-md flex flex-col items-center justify-center animate-fade-in">
          <div className="relative w-full aspect-[9/16] max-h-[65vh] rounded-3xl overflow-hidden border-2 border-amber-400/60 shadow-[0_0_50px_rgba(245,158,11,0.5)] bg-black">
            <video
              ref={videoRef}
              src="/videos/pack-opening.mp4"
              playsInline
              autoPlay
              muted
              onEnded={handleVideoEnded}
              onError={() => setTimeout(onComplete, 300)}
              className="w-full h-full object-cover"
            />

            {/* Overlay sutil de iluminação */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

            {/* Badge animada de abertura */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-black/60 border border-amber-400/40 px-3 py-1 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
              <span className="font-athletic text-[10px] font-black uppercase italic tracking-wider text-amber-300">
                Abrindo Pacote BQ...
              </span>
            </div>

            {/* Botão Pular Animação */}
            <button
              type="button"
              onClick={onComplete}
              className="absolute bottom-4 right-4 z-10 rounded-xl bg-black/60 border border-white/20 px-3 py-1.5 text-[10px] font-bold text-muted hover:text-white backdrop-blur-md active:scale-95 transition-all"
            >
              Pular ➔
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
