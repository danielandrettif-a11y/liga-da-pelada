"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Medal, ShieldCheck } from "@/components/icons";
import { selectBestGoalkeeper } from "@/lib/actions/goalkeeper";
import { PlayerAvatar } from "./PlayerAvatar";

type Participant = {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
};

type Props = {
  roundId: string;
  participants: Participant[];
  selectedPlayerId: string | null;
  canManage: boolean;
  points: number;
};

export function BestGoalkeeperPicker({
  roundId,
  participants,
  selectedPlayerId,
  canManage,
  points,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(canManage && !selectedPlayerId);
  const [selectedId, setSelectedId] = useState(selectedPlayerId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedPlayerId) {
      setSelectedId(selectedPlayerId);
      setOpen(false);
    }
  }, [selectedPlayerId]);

  const winner = participants.find((participant) => participant.id === selectedPlayerId);

  async function handleSave() {
    if (!selectedId) {
      setError("Escolha um participante.");
      return;
    }

    setSaving(true);
    setError("");
    const result = await selectBestGoalkeeper(roundId, selectedId);

    if (!result.success) {
      setError(result.error || "Não foi possível salvar a escolha.");
      setSaving(false);
      return;
    }

    setOpen(false);
    setSaving(false);
    router.refresh();
  }

  if (participants.length === 0) return null;

  return (
    <section className="glass-card overflow-hidden border-accent/20">
      <div className="flex items-center gap-3 border-b border-border bg-accent/5 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15">
          <Medal className="h-6 w-6 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-foreground">Melhor goleiro da rodada</h2>
          <p className="mt-0.5 text-xs text-muted">Prêmio de {points >= 0 ? "+" : ""}{points} pontos no ranking</p>
        </div>
        {winner && !open && canManage && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase text-muted hover:border-accent/40 hover:text-accent"
          >
            Alterar
          </button>
        )}
      </div>

      {!open && winner && (
        <div className="flex items-center gap-3 p-4">
          <PlayerAvatar
            name={winner.name}
            avatarUrl={winner.avatar_url}
            className="h-12 w-12 rounded-full bg-surface-hover text-sm font-black text-muted ring-2 ring-accent/30"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-foreground">{winner.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-accent">
              <ShieldCheck className="h-3.5 w-3.5" /> Destaque da rodada
            </p>
          </div>
          <span className="stat-number text-xl text-accent">{points >= 0 ? "+" : ""}{points}</span>
        </div>
      )}

      {!open && !winner && !canManage && (
        <div className="p-5 text-center">
          <p className="text-sm font-bold text-muted">Aguardando o ADM escolher o melhor goleiro.</p>
        </div>
      )}

      {open && canManage && (
        <div className="space-y-4 p-4">
          <div>
            <p className="text-sm font-bold text-foreground">Quem foi o melhor goleiro?</p>
            <p className="mt-1 text-xs text-muted">Escolha entre os participantes desta pelada.</p>
          </div>

          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {participants.map((participant) => {
              const checked = selectedId === participant.id;
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(participant.id);
                    setError("");
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    checked
                      ? "border-accent bg-accent/10"
                      : "border-border bg-background/40 hover:bg-surface-hover"
                  }`}
                >
                  <PlayerAvatar
                    name={participant.name}
                    avatarUrl={participant.avatar_url}
                    className="h-10 w-10 rounded-full bg-surface-hover text-xs font-black text-muted"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                    {participant.name}
                  </span>
                  <span className={`h-4 w-4 rounded-full border-2 ${checked ? "border-accent bg-accent shadow-[inset_0_0_0_3px_#05100B]" : "border-muted"}`} />
                </button>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {winner ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(selectedPlayerId || "");
                  setOpen(false);
                  setError("");
                }}
                disabled={saving}
                className="rounded-xl border border-border py-3 text-sm font-bold text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedId}
              className="rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Confirmar goleiro"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
