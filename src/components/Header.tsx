import { Suspense } from "react";
import { SessionHeaderActions } from "./SessionHeaderActions";
import { LeagueHeaderBrand } from "./LeagueHeaderBrand";

export function Header() {
  return (
    <header className="sticky top-0 z-40 isolate border-b border-border/80 bg-[#05100B] pt-[env(safe-area-inset-top)] shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      <div className="mx-auto flex min-h-[4.25rem] max-w-lg items-center justify-between gap-2 px-4 py-2.5">
        <Suspense fallback={<div className="h-10 w-40 animate-pulse rounded-xl bg-surface/40" />}>
          <LeagueHeaderBrand />
        </Suspense>

        <Suspense fallback={<div className="h-10 w-28 animate-pulse rounded-2xl bg-surface/40" />}>
          <SessionHeaderActions />
        </Suspense>
      </div>
    </header>
  );
}
