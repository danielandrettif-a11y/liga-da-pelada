"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "@/components/icons";
import { shuffleRoundTeams } from "@/lib/actions/rounds";

export function RoundTeamShuffleCard({
  roundId,
  canManage,
}: {
  roundId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  if (!canManage) return null;

  async function handleShuffle() {
    if (
      window.prompt(
        "Digite MISTURAR para sortear todos os times para os próximos jogos. Partidas já encerradas não serão alteradas."
      ) !== "MISTURAR"
    ) {
      return;
    }

    setLoading(true);
    setFeedback(null);

    const result = await shuffleRoundTeams(roundId);

    if (!result.success) {
      setFeedback({
        type: "error",
        message: result.error || "Não foi possível misturar os times.",
      });
    } else {
      setFeedback({
        type: "success",
        message: "Times misturados com sucesso! Os próximos jogos já usarão a nova divisão.",
      });
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface p-4 shadow-[0_12px_30px_rgba(0,0,0,.16)] transition-all">
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-background shadow-md shadow-accent/20">
          <ArrowLeftRight className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-accent">
            Intervalo da rodada
          </p>
          <h2 className="mt-0.5 text-sm font-black text-foreground">
            Misturar todos os times
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Sorteia uma nova divisão equilibrada para os próximos jogos. Resultados, vitórias e pontos das partidas encerradas ficam preservados.
          </p>

          <button
            type="button"
            disabled={loading}
            onClick={handleShuffle}
            className="mt-3.5 w-full rounded-xl bg-accent px-4 py-3 text-xs font-black text-background shadow-lg shadow-accent/15 transition-all hover:bg-accent-light active:scale-[.98] disabled:opacity-50"
          >
            {loading ? "Misturando times..." : "Sortear nova formação"}
          </button>

          {feedback && (
            <p
              role="status"
              className={`mt-3 rounded-xl p-2.5 text-center text-xs font-bold ${
                feedback.type === "success"
                  ? "bg-success/15 text-success border border-success/25"
                  : "bg-danger/15 text-danger border border-danger/25"
              }`}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
