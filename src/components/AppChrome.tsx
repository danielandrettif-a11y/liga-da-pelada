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

  return <>
    {!publicPage && header}
    <main className={publicPage
      ? "min-w-0 flex-1 w-full"
      : "min-w-0 flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom)+1.5rem)] max-w-lg mx-auto w-full"}>
      {children}
    </main>
    {!publicPage && navigation}
    {!publicPage && installPrompt}
  </>;
}
