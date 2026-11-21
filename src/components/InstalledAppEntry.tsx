"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function InstalledAppEntry({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (authenticated && standalone && !new URLSearchParams(window.location.search).has("apresentacao")) {
      router.replace("/lobby");
    }
  }, [authenticated, router]);

  return null;
}
