"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown, Loader2 } from "@/components/icons";
import { addRoundEmergencySubstitute, transferRoundPlayerIdentity } from "@/lib/actions/rounds";
import type { Player } from "@/lib/types";

type Participant = { player_id: string; players: Player | null };
type Team = { id: string; name: string; team_players?: Array<{ player_id: string }> };

export function RoundAdminPlayerTools({ roundId, status, participants, teams, allPlayers }: { roundId: string; status: string; participants: Participant[]; teams: Team[]; allPlayers: Player[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const participantIds = useMemo(() => new Set(participants.map((entry) => entry.player_id)), [participants]);
  const outsidePlayers = allPlayers.filter((player) => !participantIds.has(player.id));

  function submit() {
    if (!sourceId || !targetId || (status !== "finished" && !teamId)) return;
    const actionLabel = status === "finished" ? "TRANSFERIR" : "SUBSTITUIR";
    if (window.prompt(`Digite ${actionLabel} para confirmar.`) !== actionLabel) return;
    setMessage("");
    startTransition(async () => {
      const result = status === "finished"
        ? await transferRoundPlayerIdentity(roundId, sourceId, targetId)
        : await addRoundEmergencySubstitute(roundId, sourceId, targetId, teamId);
      setMessage(result.success ? "Alteração concluída." : result.error || "Não foi possível concluir.");
      if (result.success) { setSourceId(""); setTargetId(""); setTeamId(""); router.refresh(); }
    });
  }

  return (
    <section className="space-y-2">
      <button type="button" onClick={() => setOpen((value) => !value)} className="glass-card flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10"><ArrowLeftRight className="h-5 w-5 text-warning" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-xs font-black uppercase text-foreground">{status === "finished" ? "Corrigir participante" : "Substituto emergencial"}</strong><span className="text-[10px] text-muted">{status === "finished" ? "Transfira somente o histórico desta pelada" : "Troque um ausente por alguém de fora da lista"}</span></span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="glass-card space-y-3 p-4 animate-fade-in">
          <label className="block text-[10px] font-black uppercase text-muted">Perfil usado por engano<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="">Escolha</option>{participants.filter((entry) => entry.players).map((entry) => <option key={entry.player_id} value={entry.player_id}>{entry.players?.name}</option>)}</select></label>
          <label className="block text-[10px] font-black uppercase text-muted">{status === "finished" ? "Perfil correto" : "Jogador que vai entrar"}<select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="">Escolha</option>{(status === "finished" ? allPlayers.filter((player) => player.id !== sourceId) : outsidePlayers).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
          {status !== "finished" && <label className="block text-[10px] font-black uppercase text-muted">Time de destino<select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="">Escolha</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
          <button type="button" disabled={pending || !sourceId || !targetId || (status !== "finished" && !teamId)} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-warning py-3 text-xs font-black text-background disabled:opacity-40">{pending && <Loader2 className="h-4 w-4 animate-spin" />}{status === "finished" ? "Transferir participação" : "Confirmar substituição"}</button>
          {message && <p role="status" className={`text-xs font-bold ${message === "Alteração concluída." ? "text-success" : "text-danger"}`}>{message}</p>}
        </div>
      )}
    </section>
  );
}

