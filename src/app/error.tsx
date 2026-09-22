"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    navigator.sendBeacon(
      "/api/internal/observability",
      new Blob([JSON.stringify({
        kind: "client_error",
        name: "route_error_boundary",
        message: error.message,
        path: window.location.pathname,
      })], { type: "application/json" }),
    );
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-danger">Falha nesta tela</span>
      <h1 className="mt-4 text-2xl font-black text-foreground">A jogada não carregou.</h1>
      <p className="mt-2 text-sm leading-6 text-muted">O restante do app continua funcionando. Tente de novo ou volte ao início.</p>
      <div className="mt-6 grid w-full grid-cols-2 gap-2">
        <Link href="/" className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-foreground">Ir ao início</Link>
        <button type="button" onClick={reset} className="rounded-xl bg-accent px-4 py-3 text-sm font-black text-background">Tentar novamente</button>
      </div>
      {error.digest && <p className="mt-4 text-[10px] text-muted/70">Código: {error.digest}</p>}
    </main>
  );
}
