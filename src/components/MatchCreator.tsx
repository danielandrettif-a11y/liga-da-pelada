"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatch } from "@/lib/actions/matches";
import { Swords, ArrowLeft, ChevronRight, AlertTriangle, Check } from "@/components/icons";
import Link from "next/link";
import { TeamCrest } from "./TeamCrest";

export function MatchCreator({ round }: { round: any }) {
  const router = useRouter();
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [replacementByAbsent, setReplacementByAbsent] = useState<Record<string, string>>({});

  const teams = round?.teams || [];
  const selectedTeamIds = useMemo(() => [teamAId, teamBId].filter(Boolean), [teamAId, teamBId]);
  const availability = useMemo(() => new Map(
    (round?.round_players || []).map((entry: any) => [entry.player_id, entry.availability_status || "available"]),
  ), [round?.round_players]);
  const selectedTeams = teams.filter((team: any) => selectedTeamIds.includes(team.id));
  const injuredPlayers = selectedTeams.flatMap((team: any) =>
    (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "injured")
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id })),
  );
  const waitingPlayers = teams
    .filter((team: any) => !selectedTeamIds.includes(team.id))
    .flatMap((team: any) => (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "available")
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
    if (uncoveredPlayers.length > 0 && !confirm(
      `${uncoveredPlayers.length} desfalque(s) estao sem substituto. Deseja iniciar a partida com menos jogadores?`,
    )) return;

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
                `}
                disabled={teamBId === t.id}
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
                `}
                disabled={teamAId === t.id}
              >
                <TeamCrest name={t.name} crestUrl={t.crest_url} color={t.color} className="h-11 w-11" />
                <span className="text-xs font-bold truncate w-full text-center">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

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
                      <span className="shrink-0 text-[9px] font-black uppercase text-danger">{entry.team.name} · fora</span>
                    </span>
                    <select
                      value={replacementByAbsent[entry.playerId] || ""}
                      onChange={(event) => setReplacementByAbsent((current) => ({ ...current, [entry.playerId]: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none focus:border-accent"
                    >
                      <option value="">Jogar com um a menos</option>
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
