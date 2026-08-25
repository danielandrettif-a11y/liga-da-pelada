import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SessionHeaderActions } from "./SessionHeaderActions";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-[#05100B]/98 pt-[env(safe-area-inset-top)] backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 min-w-0"
          aria-label="Pelada de Baixa Qualidade — página inicial"
        >
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#020b07] shadow-[0_0_20px_rgba(204,255,0,.08)] transition-transform group-hover:scale-[1.03]">
            <Image
              src="/brand-logo.png"
              alt=""
              width={203}
              height={255}
              priority
              className="absolute -left-[6px] -top-[9px] h-[62px] w-[50px] max-w-none"
            />
          </div>

          <div className="font-athletic uppercase italic leading-none truncate">
            <span className="block text-[18px] font-black tracking-tight text-accent leading-none">
              Pelada
            </span>
            <span className="mt-0.5 flex items-baseline gap-1 text-[11px] font-black tracking-[0.025em] leading-none">
              <span className="text-accent">de</span>
              <span className="text-white">Baixa</span>
              <span className="text-accent">Qualidade</span>
            </span>
          </div>
        </Link>

        <Suspense fallback={<div className="h-10 w-28 animate-pulse rounded-2xl bg-surface/40" />}>
          <SessionHeaderActions />
        </Suspense>
      </div>
    </header>
  );
}
