"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { finishRound } from "@/lib/actions/rounds";

export function FinishRoundButton({ roundId, status }: { roundId: string, status: string }) {
  const [loading, setLoading] = useState(false);

  if (status === "finished") {
    return (
      <div className="w-full bg-surface border border-accent/20 text-accent font-bold py-4 rounded-xl flex items-center justify-center gap-2 mt-6">
        <CheckCircle2 className="w-5 h-5" />
        Rodada Encerrada
      </div>
    );
  }

  const handleFinish = async () => {
    if (!confirm("Tem certeza que deseja encerrar a rodada? Nenhuma nova partida poderá ser criada e os pontos finais serão consolidados no Ranking.")) return;
    
    setLoading(true);
    await finishRound(roundId);
    setLoading(false);
  };

  return (
    <button
      onClick={handleFinish}
      disabled={loading}
      className="w-full mt-6 bg-surface border border-danger/30 hover:bg-danger/10 text-danger font-bold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
    >
      <CheckCircle2 className="w-5 h-5" />
      {loading ? "Encerrando..." : "Encerrar Rodada"}
    </button>
  );
}
