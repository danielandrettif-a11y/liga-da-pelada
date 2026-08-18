"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "@/components/icons";

type Props = {
  roundNumber?: number;
  onTearStart: () => void;
  onTearComplete: () => void;
};

export function PackTearInteraction({ roundNumber, onTearStart, onTearComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const progressRef = useRef(0);
  const hasTriggeredStartRef = useRef(false);

  const [isCompleted, setIsCompleted] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);

  // Manipulação de Pointer Events direta na DOM (Zero React re-renders durante arrasto)
  function handlePointerDown(e: React.PointerEvent) {
    if (isCompleted || isSnapping) return;
    
    // Captura o ponteiro para acompanhar mesmo se sair da div
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;

    if (!hasTriggeredStartRef.current) {
      hasTriggeredStartRef.current = true;
      onTearStart();
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDraggingRef.current || isCompleted || isSnapping) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    // Distância total do arrasto (horizontal da esquerda para direita ou puxão para baixo)
    const pullDistance = Math.max(deltaX, deltaY * 0.8);
    const maxTearWidth = 200; // 200px de deslocamento para 100% de rasgo
    const rawProgress = Math.max(0, Math.min(1, pullDistance / maxTearWidth));

    progressRef.current = rawProgress;

    // Atualiza CSS Variables diretamente na ref sem disparar re-render do React
    if (containerRef.current) {
      containerRef.current.style.setProperty("--tear-progress", rawProgress.toFixed(3));
      containerRef.current.style.setProperty("--tear-px", `${(rawProgress * 180).toFixed(1)}px`);
    }
  }

  function finishTear() {
    setIsSnapping(true);
    if (containerRef.current) {
      containerRef.current.style.setProperty("--tear-progress", "1");
      containerRef.current.style.setProperty("--tear-px", "180px");
    }

    // Feedback háptico no celular
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch {}
    }

    setTimeout(() => {
      setIsCompleted(true);
      onTearComplete();
    }, 450);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    // Se passou de 55%, completa o rasgo com snap
    if (progressRef.current >= 0.55) {
      finishTear();
    } else {
      // Recua suavemente
      progressRef.current = 0;
      if (containerRef.current) {
        containerRef.current.style.transition = "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
        containerRef.current.style.setProperty("--tear-progress", "0");
        containerRef.current.style.setProperty("--tear-px", "0px");
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.style.transition = "";
          }
        }, 250);
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-4 select-none touch-none">
      {/* HEADER EXPLICATIVO */}
      <div className="text-center mb-5">
        <span className="font-athletic text-[11px] font-black uppercase italic tracking-[0.2em] text-amber-300 flex items-center justify-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Pacote Especial Disponível
        </span>
        <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic text-white drop-shadow-md">
          {roundNumber ? `Pacote da Rodada ${String(roundNumber).padStart(2, "0")}` : "Pacote da Rodada"}
        </h2>
        <p className="mt-1 text-xs text-muted max-w-xs mx-auto">
          Puxe a lingueta superior para rasgar o lacre e revelar suas cartas.
        </p>
      </div>

      {/* PACOTE FÍSICO BQ */}
      <div
        ref={containerRef}
        className="relative w-64 h-92 sm:w-72 sm:h-96 rounded-3xl overflow-visible p-1 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.9)] transition-transform duration-200 hover:scale-[1.01]"
        style={{
          perspective: "1000px",
          // @ts-ignore
          "--tear-progress": "0",
          "--tear-px": "0px",
        }}
      >
        {/* FAIXA SUPERIOR DO LACRE (Arrancável) */}
        <div
          ref={handleRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative z-30 h-16 w-full rounded-t-3xl border-2 border-amber-400/80 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 p-2 cursor-grab active:cursor-grabbing shadow-lg select-none ${
            isSnapping ? "pack-strip-ejecting" : ""
          }`}
          style={{
            transformOrigin: "left bottom",
            clipPath: isSnapping
              ? undefined
              : `polygon(0 0, 100% 0, 100% 100%, calc(100% - var(--tear-px, 0px)) 100%, 0 calc(100% - (var(--tear-px, 0px) * 0.15)))`,
          }}
        >
          {/* Textura serrilhada de embalagem */}
          <div className="absolute inset-x-0 top-1 h-1 bg-black/20 repeating-linear-gradient" />

          <div className="flex items-center justify-between h-full px-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base animate-bounce">⚡</span>
              <span className="font-athletic text-[11px] font-black uppercase italic tracking-wider text-black">
                Puxe para rasgar
              </span>
            </div>

            {/* Lingueta de arraste */}
            <div className="flex items-center gap-1 bg-black/20 rounded-full px-2 py-1 border border-black/30 animate-pulse">
              <span className="font-athletic text-[10px] font-black text-black">ABRIR</span>
              <span className="text-xs text-black font-bold">➔</span>
            </div>
          </div>
        </div>

        {/* CORPO PRINCIPAL DO PACOTE BQ */}
        <div
          className={`relative z-10 flex-1 rounded-b-3xl border-2 border-t-0 border-amber-400/60 bg-gradient-to-b from-[#0e2a1b] via-[#071910] to-[#040c08] p-5 flex flex-col items-center justify-between overflow-hidden ${
            isSnapping ? "pack-glowing" : ""
          }`}
        >
          {/* Textura geométrica de futebol no fundo */}
          <div className="pointer-events-none absolute inset-0 opacity-15 bg-[radial-gradient(#CCFF00_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Feixe de luz metálico (shimmer) */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[pack-foil-shimmer_3s_infinite]" />

          {/* Logo BQ Sports Pack */}
          <div className="relative z-10 text-center mt-2">
            <div className="inline-flex items-center justify-center rounded-2xl border border-accent/40 bg-accent/15 px-3 py-1 text-accent shadow-[0_0_15px_rgba(204,255,0,0.3)]">
              <span className="font-athletic text-2xl font-black italic tracking-tighter">BQ</span>
            </div>
            <span className="block font-athletic text-[10px] font-bold uppercase tracking-[0.25em] text-muted mt-1">
              SPORTS PACK
            </span>
          </div>

          {/* Emblema Central */}
          <div className="relative z-10 my-auto flex flex-col items-center text-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-black/80 shadow-[0_0_30px_rgba(245,158,11,0.25)] text-4xl">
              ⚽
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-accent"></span>
              </span>
            </div>

            <span className="mt-3 font-athletic text-base font-black uppercase italic tracking-wider text-white">
              PACOTE DA RODADA
            </span>
            <span className="text-[10px] text-muted font-medium">Contém 2 cartas especiais</span>
          </div>

          {/* Rodapé do Pacote */}
          <div className="relative z-10 w-full text-center border-t border-white/10 pt-2">
            <span className="font-athletic text-[9px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
              EDIÇÃO LIMITADA • CARTOLA V3
            </span>
          </div>
        </div>
      </div>

      {/* BOTÃO DE ATALHO RÁPIDO / ACESSIBILIDADE */}
      <button
        type="button"
        onClick={() => {
          if (!hasTriggeredStartRef.current) {
            hasTriggeredStartRef.current = true;
            onTearStart();
          }
          finishTear();
        }}
        className="mt-6 flex items-center gap-1.5 text-xs text-muted hover:text-amber-300 font-bold underline-offset-4 hover:underline transition-colors active:scale-95"
      >
        <span>Ou toque aqui para abrir direto</span>
        <span>✨</span>
      </button>
    </div>
  );
}
