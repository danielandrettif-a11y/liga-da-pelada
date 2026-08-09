"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMatch } from "@/lib/actions/matches";
import { Swords, ArrowLeft, ChevronRight } from "@/components/icons";
import Link from "next/link";

export function MatchCreator({ round }: { round: any }) {
  const router = useRouter();
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const teams = round?.teams || [];

  async function handleStart() {
    if (!teamAId || !teamBId) {
      setError("Selecione os dois times para iniciar.");
      return;
    }
    if (teamAId === teamBId) {
      setError("Os times devem ser diferentes.");
      return;
    }

    setLoading(true);
    setError("");

    // O match_order seria a quantidade de matches + 1
    const order = (round?.matches?.length || 0) + 1;

    const res = await createMatch({
      round_id: round.id,
      team_a_id: teamAId,
      team_b_id: teamBId,
      match_order: order,
    });

    if (!res.success) {
      setError(res.error || "Erro ao criar partida");
      setLoading(false);
      return;
    }

    router.push(`/partidas/${res.matchId}`);
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link
          href={`/rodadas/${round.id}`}
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Nova Partida</h1>
          <p className="text-xs text-muted mt-0.5">
            Rodada {String(round.number).padStart(2, "0")}
          </p>
        </div>
      </div>

      <div className="glass-card p-6 flex flex-col items-center gap-6 animate-fade-in-up">
        
        {error && (
          <div className="w-full p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold text-center">
            {error}
          </div>
        )}

        {/* Team A */}
        <div className="w-full space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider pl-1">
            Time 1
          </label>
          <div className="grid grid-cols-3 gap-2">
            {teams.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setTeamAId(t.id)}
                className={`
                  p-3 rounded-xl border flex flex-col items-center gap-2 transition-all
                  ${teamAId === t.id 
                    ? "border-accent bg-accent/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                    : "border-border bg-surface hover:bg-surface-hover"}
                  ${teamBId === t.id ? "opacity-50 cursor-not-allowed" : ""}
                `}
                disabled={teamBId === t.id}
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-xs font-bold truncate w-full text-center">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center ring-4 ring-background z-10 -my-3">
          <Swords className="w-5 h-5 text-muted" />
        </div>

        {/* Team B */}
        <div className="w-full space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider pl-1">
            Time 2
          </label>
          <div className="grid grid-cols-3 gap-2">
            {teams.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setTeamBId(t.id)}
                className={`
                  p-3 rounded-xl border flex flex-col items-center gap-2 transition-all
                  ${teamBId === t.id 
                    ? "border-accent bg-accent/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                    : "border-border bg-surface hover:bg-surface-hover"}
                  ${teamAId === t.id ? "opacity-50 cursor-not-allowed" : ""}
                `}
                disabled={teamAId === t.id}
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-xs font-bold truncate w-full text-center">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      <button
        onClick={handleStart}
        disabled={loading || !teamAId || !teamBId}
        className="w-full bg-accent hover:bg-accent-light text-background font-bold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
      >
        {loading ? "Criando..." : "Apita o Árbitro!"}
        <ChevronRight className="w-5 h-5" />
      </button>

    </div>
  );
}
