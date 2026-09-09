"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    navigator.sendBeacon(
      "/api/internal/observability",
      new Blob([JSON.stringify({
        kind: "client_error",
        name: "global_error_boundary",
        message: error.message,
        path: window.location.pathname,
      })], { type: "application/json" }),
    );
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center bg-[#030b06] p-6 text-white">
        <main className="max-w-sm text-center">
          <p className="text-sm font-black uppercase text-[#ccff00]">Pelada BQ</p>
          <h1 className="mt-3 text-2xl font-black">Algo saiu do jogo.</h1>
          <p className="mt-2 text-sm text-white/70">O erro foi registrado. Tente carregar esta tela novamente.</p>
          <button onClick={reset} className="mt-6 rounded-xl bg-[#ccff00] px-5 py-3 font-black text-black">
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
