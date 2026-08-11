"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2 } from "@/components/icons";
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
  const [isOpen, setIsOpen] = useState(false);
  const visibleEntries = canManage ? entries : entries.filter((entry) => entry.availability_status === "injured");
  const injuredCount = entries.filter((entry) => entry.availability_status === "injured").length;
  const availableCount = entries.length - injuredCount;
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
    if (!result.success) setMessage(result.error || "Não foi possível alterar a disponibilidade.");
    setPendingPlayerId(null);
  }

  if (!canManage && sortedEntries.length === 0) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls="round-availability-list"
        className="glass-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${injuredCount > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
          {injuredCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black uppercase tracking-wider text-foreground">Disponibilidade</span>
          <span className="mt-0.5 block text-[10px] font-semibold text-muted">
            {availableCount} disponíveis · {injuredCount} fora
          </span>
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-muted">{isOpen ? "Fechar" : "Ver lista"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div id="round-availability-list" className="glass-card divide-y divide-border overflow-hidden animate-fade-in">
          {sortedEntries.map((entry) => {
            const isInjured = entry.availability_status === "injured";
            const isPending = pendingPlayerId === entry.player_id;
            return (
              <div key={entry.player_id} className="flex items-center gap-3 px-4 py-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isInjured ? "bg-danger/15 text-danger" : "bg-success/10 text-success"}`}>
                  {isInjured ? <AlertTriangle className="h-4.5 w-4.5" /> : <Check className="h-4.5 w-4.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{entry.players?.name}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${isInjured ? "text-danger" : "text-muted"}`}>
                    {isInjured ? "Machucado · fora dos próximos jogos" : "Disponível"}
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
      )}
      {message && <p className="mt-2 px-1 text-xs font-semibold text-danger" role="alert">{message}</p>}
    </section>
  );
}
