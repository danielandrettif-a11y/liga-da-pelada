"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Users } from "@/components/icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { setRoundPlayerAttendance } from "@/lib/actions/rounds";

type AttendanceEntry = {
  player_id: string;
  attendance_status: "pending" | "present";
  attendance_order: number | null;
  players: { id: string; name: string; avatar_url?: string | null } | null;
};

export function RoundAttendanceManager({ roundId, entries, canManage }: {
  roundId: string;
  entries: AttendanceEntry[];
  canManage: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const ordered = useMemo(() => [...entries].filter((entry) => entry.players).sort((a, b) => {
    if (a.attendance_status !== b.attendance_status) return a.attendance_status === "present" ? -1 : 1;
    if (a.attendance_status === "present") return (a.attendance_order || 0) - (b.attendance_order || 0);
    return (a.players?.name || "").localeCompare(b.players?.name || "", "pt-BR");
  }), [entries]);
  const presentCount = entries.filter((entry) => entry.attendance_status === "present").length;

  async function toggle(entry: AttendanceEntry) {
    setPendingId(entry.player_id);
    setMessage("");
    const result = await setRoundPlayerAttendance(roundId, entry.player_id, entry.attendance_status !== "present");
    if (!result.success) setMessage(result.error || "Nao foi possivel atualizar a presenca.");
    setPendingId(null);
  }

  return (
    <section className="space-y-2">
      <button type="button" onClick={() => setIsOpen((value) => !value)} className="glass-card flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Users className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black uppercase tracking-wider text-foreground">Chegadas — {presentCount}/{entries.length}</span>
          <span className="mt-0.5 block text-[10px] font-semibold text-muted">Ordem dos times que comecam jogando</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="glass-card divide-y divide-border overflow-hidden">
          {ordered.map((entry) => {
            const present = entry.attendance_status === "present";
            return (
              <div key={entry.player_id} className="flex items-center gap-3 px-4 py-3">
                <span className={`stat-number flex h-8 w-8 items-center justify-center rounded-lg ${present ? "bg-accent text-background" : "border border-border bg-surface text-muted"}`}>{present ? entry.attendance_order : "—"}</span>
                <PlayerAvatar name={entry.players?.name || "Jogador"} avatarUrl={entry.players?.avatar_url} className="h-9 w-9 rounded-full text-xs font-bold" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{entry.players?.name}</p>
                  <p className={`text-[9px] font-black uppercase ${present ? "text-accent" : "text-muted"}`}>{present ? "Presente" : "Ainda nao chegou"}</p>
                </div>
                {canManage && <button type="button" disabled={pendingId !== null} onClick={() => toggle(entry)} className={`rounded-lg border px-3 py-2 text-[9px] font-black uppercase disabled:opacity-50 ${present ? "border-danger/30 text-danger" : "border-accent/30 text-accent"}`}>
                  {pendingId === entry.player_id ? <Loader2 className="h-4 w-4 animate-spin" /> : present ? "Desmarcar" : <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Chegou</span>}
                </button>}
              </div>
            );
          })}
        </div>
      )}
      {message && <p className="px-1 text-xs font-semibold text-danger">{message}</p>}
    </section>
  );
}
