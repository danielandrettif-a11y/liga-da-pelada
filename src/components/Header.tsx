"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border backdrop-blur-xl bg-background/80">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
            <Trophy className="w-4.5 h-4.5 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
              LIGA DA PELADA
            </h1>
            <p className="text-[10px] text-muted font-medium tracking-widest uppercase">
              Season 01
            </p>
          </div>
        </Link>
      </div>
    </header>
  );
}
