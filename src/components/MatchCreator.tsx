"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatch } from "@/lib/actions/matches";
import { Swords, ArrowLeft, ChevronRight, AlertTriangle, Check, ArrowLeftRight, Users } from "@/components/icons";
import Link from "next/link";
import { TeamCrest } from "./TeamCrest";
import { markRoundTeamArrived, swapRoundTeamPlayers } from "@/lib/actions/rounds";

export function MatchCreator({ round }: { round: any }) {
  const router = useRouter();
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [replacementByAbsent, setReplacementByAbsent] = useState<Record<string, string>>({});
  const [swapPlayerAId, setSwapPlayerAId] = useState("");
  const [swapPlayerBId, setSwapPlayerBId] = useState("");
  const [managementLoading, setManagementLoading] = useState(false);

  const teams = round?.teams || [];
  const selectedTeamIds = useMemo(() => [teamAId, teamBId].filter(Boolean), [teamAId, teamBId]);
  const availability = useMemo(() => new Map(
    (round?.round_players || []).map((entry: any) => [entry.player_id, entry.availability_status || "available"]),
  ), [round?.round_players]);
  const attendance = useMemo(() => new Map(
    (round?.round_players || []).map((entry: any) => [entry.player_id, entry.attendance_status || "pending"]),
  ), [round?.round_players]);
  const usesAttendance = round?.formation_mode !== "manual";
  const previousMatch = useMemo(() => [...(round?.matches || [])].sort((a: any, b: any) =>
    (b.match_order || 0) - (a.match_order || 0) || String(b.created_at).localeCompare(String(a.created_at)),
  )[0], [round?.matches]);
  const firstMatchAllowedIds = new Set(teams.filter((team: any) => (team.position || 0) <= 2).map((team: any) => team.id));
  const selectedTeams = teams.filter((team: any) => selectedTeamIds.includes(team.id));
  const injuredPlayers = selectedTeams.flatMap((team: any) =>
    (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "injured" || (usesAttendance && attendance.get(entry.player_id) !== "present"))
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id, reason: availability.get(entry.player_id) === "injured" ? "Machucado" : "Ainda nao chegou" })),
  );
  const outgoingTeamIds = previousMatch
    ? [previousMatch.team_a_id, previousMatch.team_b_id].filter((id: string) => !selectedTeamIds.includes(id))
    : teams.filter((team: any) => !selectedTeamIds.includes(team.id)).map((team: any) => team.id);
  const waitingPlayers = teams
    .filter((team: any) => outgoingTeamIds.includes(team.id))
    .flatMap((team: any) => (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "available" && (!usesAttendance || attendance.get(entry.player_id) === "present"))
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id })))
    .filter((entry: any) => entry.player);

  useEffect(() => {
    setReplacementByAbsent({});
  }, [teamAId, teamBId]);

  async function handleStart() {
    if (!teamAId || !teamBId) {
      setError("Selecione os dois times para iniciar.");
      return;
    }
    if (teamAId === teamBId) {
      setError("Os times devem ser diferentes.");
      return;
    }

    const uncoveredPlayers = injuredPlayers.filter((entry: any) => !replacementByAbsent[entry.playerId]);
    if (uncoveredPlayers.length > 0) {
      setError(`Escolha substitutos para as ${uncoveredPlayers.length} vaga(s) desfalcadas.`);
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
      replacements: injuredPlayers
        .filter((entry: any) => replacementByAbsent[entry.playerId])
        .map((entry: any) => ({
          team_id: entry.team.id,
          absent_player_id: entry.playerId,
          replacement_player_id: replacementByAbsent[entry.playerId],
        })),
    });

    if (!res.success) {
      setError(res.error || "Erro ao criar partida");
      setLoading(false);
      return;
    }

    router.push(`/partidas/${res.matchId}`);
  }

  async function markTeamArrived(teamId: string) {
    setManagementLoading(true);
    setError("");
    const result = await markRoundTeamArrived(round.id, teamId);
    if (!result.success) setError(result.error || "Nao foi possivel atualizar as chegadas.");
    else router.refresh();
    setManagementLoading(false);
  }

  async function handlePermanentSwap() {
    if (!swapPlayerAId || !swapPlayerBId) return;
    setManagementLoading(true);
    setError("");
    const result = await swapRoundTeamPlayers(round.id, swapPlayerAId, swapPlayerBId);
    if (!result.success) setError(result.error || "Nao foi possivel realizar a troca.");
    else {
      setSwapPlayerAId("");
      setSwapPlayerBId("");
      router.refresh();
    }
    setManagementLoading(false);
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
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
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
                  ${!previousMatch && usesAttendance && !firstMatchAllowedIds.has(t.id) ? "opacity-35 cursor-not-allowed" : ""}
                `}
                disabled={teamBId === t.id || (!previousMatch && usesAttendance && !firstMatchAllowedIds.has(t.id))}
              >
                <TeamCrest name={t.name} crestUrl={t.crest_url} color={t.color} className="h-11 w-11" />
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
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
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
                  ${!previousMatch && usesAttendance && !firstMatchAllowedIds.has(t.id) ? "opacity-35 cursor-not-allowed" : ""}
                `}
                disabled={teamAId === t.id || (!previousMatch && usesAttendance && !firstMatchAllowedIds.has(t.id))}
              >
                <TeamCrest name={t.name} crestUrl={t.crest_url} color={t.color} className="h-11 w-11" />
                <span className="text-xs font-bold truncate w-full text-center">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 text-warning"><ArrowLeftRight className="h-4.5 w-4.5" /></span>
          <div><h2 className="text-sm font-black text-foreground">Troca permanente</h2><p className="text-[10px] text-muted">Inverta dois jogadores entre os times para as proximas partidas.</p></div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {[{ value: swapPlayerAId, set: setSwapPlayerAId, label: "Jogador 1" }, { value: swapPlayerBId, set: setSwapPlayerBId, label: "Jogador 2" }].map((field) => (
            <label key={field.label} className="block"><span className="mb-1.5 block text-[9px] font-black uppercase text-muted">{field.label}</span><select value={field.value} onChange={(event) => field.set(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-xs font-bold text-foreground"><option value="">Selecionar</option>{teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => <option key={entry.player_id} value={entry.player_id}>{entry.players?.name} · {team.name}</option>))}</select></label>
          ))}
          <button type="button" disabled={managementLoading || !swapPlayerAId || !swapPlayerBId} onClick={handlePermanentSwap} className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs font-black text-warning disabled:opacity-40">Trocar</button>
        </div>
      </section>

      {selectedTeamIds.length === 2 && (
        <section className="glass-card overflow-hidden animate-fade-in-up">
          <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${injuredPlayers.length > 0 ? "bg-danger/15 text-danger" : "bg-success/10 text-success"}`}>
              {injuredPlayers.length > 0 ? <AlertTriangle className="h-4.5 w-4.5" /> : <Check className="h-4.5 w-4.5" />}
            </span>
            <div>
              <h2 className="text-sm font-black text-foreground">Escalacao da partida</h2>
              <p className="text-[10px] font-semibold text-muted">
                {injuredPlayers.length > 0 ? `${injuredPlayers.length} desfalque(s) para cobrir` : "Todos os jogadores estao disponiveis"}
              </p>
            </div>
          </div>

          {injuredPlayers.length > 0 && (
            <div className="space-y-4 p-4">
              {usesAttendance && [...new Set(injuredPlayers.filter((entry: any) => entry.reason === "Ainda nao chegou").map((entry: any) => entry.team.id))].map((teamId: any) => {
                const team = teams.find((item: any) => item.id === teamId);
                return <div key={teamId} className="rounded-xl border border-warning/25 bg-warning/5 p-3"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-warning" /><p className="flex-1 text-xs font-bold text-foreground">Todo mundo do {team?.name} chegou?</p><button type="button" disabled={managementLoading} onClick={() => markTeamArrived(teamId)} className="rounded-lg bg-accent px-3 py-2 text-[9px] font-black uppercase text-background">Sim, todos</button></div><p className="mt-2 text-[10px] text-muted">Se nao, escolha abaixo quem sera emprestado pelo time que acabou de sair.</p></div>;
              })}
              {injuredPlayers.map((entry: any) => {
                const usedByAnother = new Set(
                  Object.entries(replacementByAbsent)
                    .filter(([absentId]) => absentId !== entry.playerId)
                    .map(([, replacementId]) => replacementId),
                );
                return (
                  <label key={entry.playerId} className="block">
                    <span className="mb-2 flex items-center justify-between gap-3 text-xs font-bold">
                      <span className="truncate text-foreground">{entry.player?.name || "Jogador"}</span>
                      <span className="shrink-0 text-[9px] font-black uppercase text-danger">{entry.team.name} · {entry.reason}</span>
                    </span>
                    <select
                      value={replacementByAbsent[entry.playerId] || ""}
                      onChange={(event) => setReplacementByAbsent((current) => ({ ...current, [entry.playerId]: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none focus:border-accent"
                    >
                      <option value="">Escolha um substituto</option>
                      {waitingPlayers
                        .filter((candidate: any) => !usedByAnother.has(candidate.playerId))
                        .map((candidate: any) => (
                          <option key={candidate.playerId} value={candidate.playerId}>
                            {candidate.player.name} · emprestado do {candidate.team.name}
                          </option>
                        ))}
                    </select>
                  </label>
                );
              })}
              {waitingPlayers.length === 0 && (
                <p className="rounded-xl bg-warning/10 p-3 text-xs font-semibold text-warning">
                  Nao ha jogadores disponiveis nos times que estao aguardando.
                </p>
              )}
            </div>
          )}
        </section>
      )}

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
