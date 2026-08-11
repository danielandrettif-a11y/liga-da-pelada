"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "@/components/icons";
import { setRoundPlayerAvailability } from "@/lib/actions/rounds";

type AvailabilityPlayer = {
  player_id: string;
  availability_status: "available" | "injured";
  players: { id: string; name: string } | null;
};

export function RoundAvailabilityManager({
  roundId,
  entries,
  canManage,
}: {
  roundId: string;
  entries: AvailabilityPlayer[];
  canManage: boolean;
}) {
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const visibleEntries = canManage ? entries : entries.filter((entry) => entry.availability_status === "injured");
  const sortedEntries = [...visibleEntries]
    .filter((entry) => entry.players)
    .sort((a, b) => {
      if (a.availability_status !== b.availability_status) return a.availability_status === "injured" ? -1 : 1;
      return (a.players?.name || "").localeCompare(b.players?.name || "", "pt-BR");
    });

  async function toggle(entry: AvailabilityPlayer) {
    const nextStatus = entry.availability_status === "injured" ? "available" : "injured";
    setPendingPlayerId(entry.player_id);
    setMessage("");
    const result = await setRoundPlayerAvailability(roundId, entry.player_id, nextStatus);
    if (!result.success) setMessage(result.error || "Nao foi possivel alterar a disponibilidade.");
    setPendingPlayerId(null);
  }

  if (!canManage && sortedEntries.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Disponibilidade</h2>
        <span className="text-[10px] font-bold text-muted">
          {sortedEntries.filter((entry) => entry.availability_status === "injured").length} fora
        </span>
      </div>

      <div className="glass-card divide-y divide-border overflow-hidden">
        {sortedEntries.map((entry) => {
          const isInjured = entry.availability_status === "injured";
          const isPending = pendingPlayerId === entry.player_id;
          return (
            <div key={entry.player_id} className="flex items-center gap-3 px-4 py-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isInjured ? "bg-danger/15 text-danger" : "bg-success/10 text-success"}`}>
                {isInjured ? <AlertTriangle className="h-4.5 w-4.5" /> : <Check className="h-4.5 w-4.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{entry.players?.name}</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${isInjured ? "text-danger" : "text-muted"}`}>
                  {isInjured ? "Machucado · fora dos proximos jogos" : "Disponivel"}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  disabled={pendingPlayerId !== null}
                  onClick={() => toggle(entry)}
                  className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase transition-colors disabled:opacity-50 ${isInjured ? "border-accent/40 text-accent hover:bg-accent/10" : "border-danger/30 text-danger hover:bg-danger/10"}`}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isInjured ? "Liberar" : "Marcar fora"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="mt-2 px-1 text-xs font-semibold text-danger" role="alert">{message}</p>}
    </section>
  );
}
