"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Users } from "@/components/icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { setRoundAttendanceBulk, setRoundPlayerAttendance } from "@/lib/actions/rounds";

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
  const [bulkLoading, setBulkLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [localEntries, setLocalEntries] = useState(entries);

  useEffect(() => setLocalEntries(entries), [entries]);

  const ordered = useMemo(() => [...localEntries].filter((entry) => entry.players).sort((a, b) => {
    if (a.attendance_status !== b.attendance_status) return a.attendance_status === "present" ? -1 : 1;
    if (a.attendance_status === "present") return (a.attendance_order || 0) - (b.attendance_order || 0);
    return (a.players?.name || "").localeCompare(b.players?.name || "", "pt-BR");
  }), [localEntries]);

  const presentCount = localEntries.filter((entry) => entry.attendance_status === "present").length;

  function withNormalizedOrders(items: AttendanceEntry[]) {
    const orderByPlayer = new Map(
      items
        .filter((item) => item.attendance_status === "present")
        .sort((a, b) => (a.attendance_order ?? Number.MAX_SAFE_INTEGER) - (b.attendance_order ?? Number.MAX_SAFE_INTEGER)
          || (a.players?.name || "").localeCompare(b.players?.name || "", "pt-BR"))
        .map((item, index) => [item.player_id, index + 1]),
    );
    return items.map((item) => item.attendance_status === "present"
      ? { ...item, attendance_order: orderByPlayer.get(item.player_id) || null }
      : { ...item, attendance_order: null });
  }

  async function toggle(entry: AttendanceEntry) {
    const previous = localEntries;
    const willBePresent = entry.attendance_status !== "present";
    setLocalEntries((current) => withNormalizedOrders(current.map((item) => item.player_id === entry.player_id
      ? { ...item, attendance_status: willBePresent ? "present" : "pending" }
      : item)));
    setPendingId(entry.player_id);
    setMessage("");
    const result = await setRoundPlayerAttendance(roundId, entry.player_id, willBePresent);
    if (!result.success) {
      setLocalEntries(previous);
      setMessage(result.error || "Não foi possível atualizar a presença.");
    }
    setPendingId(null);
  }

  async function markAll(status: boolean) {
    const previous = localEntries;
    const next = withNormalizedOrders(localEntries.map((entry) => ({
      ...entry,
      attendance_status: status ? "present" as const : "pending" as const,
    })));
    setLocalEntries(next);
    setBulkLoading(true);
    setMessage("");
    const presentPlayerIds = next
      .filter((entry) => entry.attendance_status === "present")
      .sort((a, b) => (a.attendance_order || 0) - (b.attendance_order || 0))
      .map((entry) => entry.player_id);
    const result = await setRoundAttendanceBulk(roundId, presentPlayerIds);
    if (!result.success) {
      setLocalEntries(previous);
      setMessage(result.error || "Não foi possível atualizar as presenças.");
    }
    setBulkLoading(false);
  }

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="glass-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-accent/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Users className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black uppercase tracking-wider text-foreground">
            Chegadas — {presentCount}/{entries.length}
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold text-muted">
            Ordem dos times que começam jogando
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : ""}`} />
      </button>

      {isOpen && (
        <div className="glass-card overflow-hidden animate-fade-in">
          {/* BARRA SUPERIOR DE AÇÕES RÁPIDAS (TOPO) */}
          <div className="flex items-center justify-between border-b border-border/80 bg-surface/80 px-4 py-2.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-accent">
              {presentCount} de {entries.length} no estádio
            </span>
            {canManage && (
              <div className="flex gap-2">
                {presentCount < localEntries.length ? (
                  <button
                    type="button"
                    disabled={bulkLoading || pendingId !== null}
                    onClick={() => markAll(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-black uppercase text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
                  >
                    {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Todos chegaram
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={bulkLoading || pendingId !== null}
                    onClick={() => markAll(false)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[10px] font-bold text-muted hover:text-danger disabled:opacity-50"
                  >
                    Limpar presenças
                  </button>
                )}
              </div>
            )}
          </div>

          {/* A pagina e a dona da rolagem: listas longas nao prendem o gesto no celular. */}
          <div className="divide-y divide-border/50">
            {ordered.map((entry) => {
              const present = entry.attendance_status === "present";
              return (
                <div key={entry.player_id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${present ? "bg-accent/[0.03]" : ""}`}>
                  <span className={`stat-number flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${present ? "bg-accent text-background shadow-sm" : "border border-border bg-surface text-muted"}`}>
                    {present ? entry.attendance_order : "—"}
                  </span>
                  <PlayerAvatar name={entry.players?.name || "Jogador"} avatarUrl={entry.players?.avatar_url} className="h-9 w-9 rounded-full text-xs font-bold shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{entry.players?.name}</p>
                    <p className={`text-[9px] font-black uppercase tracking-wider ${present ? "text-accent" : "text-muted"}`}>
                      {present ? `Confirmado #${entry.attendance_order}` : "Ainda não chegou"}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      disabled={pendingId !== null || bulkLoading}
                      onClick={() => toggle(entry)}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition-all active:scale-95 disabled:opacity-50 ${
                        present
                          ? "border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
                          : "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
                      }`}
                    >
                      {pendingId === entry.player_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : present ? (
                        "Desmarcar"
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Chegou
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {message && <p className="px-1 text-xs font-semibold text-danger">{message}</p>}
    </section>
  );
}
