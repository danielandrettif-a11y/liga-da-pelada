"use client";

import { Children, type ReactNode, useRef, useState } from "react";

export function HomeHeroCarousel({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function updateActiveSlide() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActiveIndex(Math.min(items.length - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth))));
  }

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
    setActiveIndex(index);
  }

  return (
    <div className="space-y-3">
      <div
        ref={trackRef}
        onScroll={updateActiveSlide}
        className="flex w-full snap-x snap-mandatory overflow-x-auto hide-scrollbar overscroll-x-contain touch-auto [-webkit-overflow-scrolling:touch]"
        aria-label="Destaques da Pelada BQ"
      >
        {items.map((item, index) => (
          <div key={index} className="w-full min-w-full shrink-0 snap-center px-0.5">
            {item}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2" aria-label="Selecionar destaque">
        {items.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goTo(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${activeIndex === index ? "w-7 bg-accent shadow-[0_0_10px_rgba(204,255,0,.45)]" : "w-1.5 bg-muted/35"}`}
            aria-label={`Abrir destaque ${index + 1}`}
            aria-current={activeIndex === index ? "true" : undefined}
          />
        ))}
      </div>
      <p className="text-center text-[9px] font-bold uppercase tracking-[0.18em] text-muted/70">
        Arraste para o lado
      </p>
    </div>
  );
}
