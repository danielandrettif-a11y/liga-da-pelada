"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppChrome({ children, header, navigation, installPrompt }: {
  children: ReactNode;
  header: ReactNode;
  navigation: ReactNode;
  installPrompt: ReactNode;
}) {
  const pathname = usePathname();
  const publicPage = pathname === "/inicio" || pathname === "/estadio";
  const accountPage = pathname === "/meu-perfil"
    || pathname === "/login"
    || pathname === "/cadastro"
    || pathname.startsWith("/redefinir-senha")
    || pathname.startsWith("/convite/");
  const leagueSelectionPage = pathname === "/lobby"
    || pathname.startsWith("/lobby/")
    || pathname === "/peladas";
  const hideLeagueNavigation = publicPage || accountPage || leagueSelectionPage;

  return <>
    {!publicPage && header}
    <main className={publicPage
      ? "min-w-0 flex-1 w-full"
      : `min-w-0 flex-1 px-4 pt-4 max-w-lg mx-auto w-full ${
          hideLeagueNavigation
            ? "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            : "pb-[calc(5.5rem+env(safe-area-inset-bottom)+1.5rem)]"
        }`}>
      {children}
    </main>
    {!hideLeagueNavigation && navigation}
    {!publicPage && installPrompt}
  </>;
}
