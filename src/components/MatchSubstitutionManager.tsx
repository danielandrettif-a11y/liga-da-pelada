"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Loader2, X } from "@/components/icons";
import { substituteMatchPlayer } from "@/lib/actions/matches";
import type { MatchSubstitutionReason, Player } from "@/lib/types";
import { isEntryResultEligible } from "@/lib/match-rules";
import { TeamMiniPitch } from "./TeamMiniPitch";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function MatchSubstitutionManager({
  match,
  canManage,
  elapsedSeconds,
}: {
  match: any;
  canManage: boolean;
  elapsedSeconds: number;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [playerOutId, setPlayerOutId] = useState("");
  const [playerInId, setPlayerInId] = useState("");
  const [reason, setReason] = useState<MatchSubstitutionReason>("tired");
  const [markInjured, setMarkInjured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useDialogViewport(open);

  const participantIds = useMemo(
    () => new Set((match.match_players || []).map((entry: any) => entry.player_id)),
    [match.match_players],
  );
  const teams = match.round?.teams || [];
  const waitingTeams = teams.filter(
    (team: any) => ![match.team_a_id, match.team_b_id].includes(team.id),
  );
  const waitingTeamIds = new Set(waitingTeams.map((team: any) => team.id));
  const originalTeamByPlayer = new Map<string, any>();
  for (const team of teams) {
    for (const teamPlayer of team.team_players || []) originalTeamByPlayer.set(teamPlayer.player_id, team);
  }
  const eligiblePlayers = (match.round?.round_players || [])
    .filter((entry: any) => entry.availability_status === "available")
    .filter((entry: any) => match.round?.formation_mode === "manual" || entry.attendance_status === "present")
    .filter((entry: any) => !participantIds.has(entry.player_id))
    .map((entry: any) => ({ ...entry, originalTeam: originalTeamByPlayer.get(entry.player_id) }))
    .filter((entry: any) => entry.players && entry.originalTeam && waitingTeamIds.has(entry.originalTeam.id))
    .sort((a: any, b: any) => a.players.name.localeCompare(b.players.name, "pt-BR"));
  const selectedOutgoing = (match.match_players || []).find(
    (entry: any) => entry.player_id === playerOutId && entry.is_active,
  );

  function resetSelection() {
    setTeamId("");
    setPlayerOutId("");
    setPlayerInId("");
    setReason("tired");
    setMarkInjured(false);
    setError("");
  }

  function close() {
    if (loading) return;
    setOpen(false);
    resetSelection();
  }

  function selectOutgoing(team: any, player: Player) {
    setTeamId(team.id);
    setPlayerOutId(player.id);
    setPlayerInId("");
    setError("");
  }

  async function submit() {
    if (!teamId || !playerOutId) {
      setError("Toque no jogador que vai sair.");
      return;
    }
    if (!playerInId && !confirm("Nenhum substituto foi escolhido. O time ficará com um jogador a menos. Continuar?")) return;

    setLoading(true);
    setError("");
    const result = await substituteMatchPlayer({
      match_id: match.id,
      team_id: teamId,
      player_out_id: playerOutId,
      player_in_id: playerInId || undefined,
      reason,
      mark_injured: markInjured,
    });
    if (!result.success) {
      setError(result.error || "Não foi possível fazer a substituição.");
      setLoading(false);
      return;
    }
    setLoading(false);
    setOpen(false);
    resetSelection();
  }

  if (!canManage || match.status !== "live") return null;

  const afterHalf = !isEntryResultEligible(elapsedSeconds, match.duration_seconds || 420);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-warning/35 bg-warning/10 py-3.5 text-sm font-black text-warning transition-colors hover:bg-warning/15 active:scale-[0.98]"
      >
        <ArrowLeftRight className="h-5 w-5" />
        Pedir substituição
      </button>

      {open && (
        <div className="mobile-dialog-backdrop bg-background/85 backdrop-blur-sm">
          <div className="glass-card flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
              <div>
                <h3 className="font-black text-foreground">Pedir substituição</h3>
                <p className="text-[10px] font-semibold text-muted">Toque em quem vai sair e escolha alguém do banco.</p>
              </div>
              <button type="button" onClick={close} className="rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-3 sm:p-4">
              {error && <p className="rounded-xl bg-danger/10 p-3 text-xs font-semibold text-danger" role="alert">{error}</p>}

              <section>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">1. Toque em quem vai sair</p>
                <div className="grid grid-cols-2 gap-2">
                  {[match.team_a, match.team_b].map((team: any, index: number) => {
                    const lineup = (match.match_players || []).filter(
                      (entry: any) => entry.team_id === team.id && entry.is_active,
                    );
                    return (
                      <TeamMiniPitch
                        key={team.id}
                        index={index}
                        selectedPlayerId={playerOutId}
                        onPlayerClick={(player) => selectOutgoing(team, player)}
                        team={{
                          ...team,
                          team_players: lineup.map((entry: any) => ({
                            player_id: entry.player_id,
                            goalkeeper_order: (team.team_players || []).find((teamPlayer: any) => teamPlayer.player_id === entry.player_id)?.goalkeeper_order ?? null,
                            players: entry.player,
                          })),
                        }}
                      />
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted">2. Banco de reservas</p>
                    <p className="mt-0.5 text-[9px] font-semibold text-muted">
                      {waitingTeams.length > 0 ? waitingTeams.map((team: any) => team.name).join(" · ") : "Nenhum time aguardando"}
                    </p>
                  </div>
                  {!playerOutId && <span className="text-[9px] font-bold text-warning">Escolha quem sai primeiro</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {eligiblePlayers.map((entry: any) => (
                    <button
                      key={entry.player_id}
                      type="button"
                      disabled={!playerOutId}
                      onClick={() => setPlayerInId(entry.player_id)}
                      className={`min-w-0 rounded-xl border p-3 text-left transition-colors disabled:opacity-45 ${playerInId === entry.player_id ? "border-accent bg-accent/10" : "border-border bg-background"}`}
                    >
                      <span className="block truncate text-xs font-black text-foreground">{entry.players.name}</span>
                      <span className="mt-0.5 block truncate text-[9px] font-bold uppercase text-muted">{entry.originalTeam.name}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!playerOutId}
                    onClick={() => setPlayerInId("")}
                    className={`rounded-xl border p-3 text-left text-xs font-black transition-colors disabled:opacity-45 ${playerOutId && !playerInId ? "border-warning bg-warning/10 text-warning" : "border-border bg-background text-muted"}`}
                  >
                    Sair sem substituto
                  </button>
                </div>
                {eligiblePlayers.length === 0 && (
                  <p className="mt-2 rounded-xl bg-warning/10 p-3 text-xs font-semibold text-warning">
                    Não há reservas disponíveis nos times que estão aguardando.
                  </p>
                )}
              </section>

              {playerOutId && (
                <section className="rounded-2xl border border-border bg-background/60 p-3">
                  <p className="mb-3 text-xs font-black text-foreground">
                    Sai: <span className="text-warning">{selectedOutgoing?.player?.name || "Jogador"}</span>
                  </p>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">3. Motivo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["tired", "Cansaço"],
                      ["injury", "Lesão"],
                      ["other", "Outro"],
                    ] as Array<[MatchSubstitutionReason, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { setReason(value); if (value === "injury") setMarkInjured(true); }}
                        className={`rounded-xl border px-2 py-3 text-xs font-black ${reason === value ? "border-warning bg-warning/10 text-warning" : "border-border bg-background text-muted"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                    <input
                      type="checkbox"
                      checked={markInjured}
                      onChange={(event) => setMarkInjured(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-xs font-bold text-foreground">Marcar como machucado</span>
                      <span className="block text-[10px] leading-relaxed text-muted">Ficará fora das próximas partidas até ser liberado.</span>
                    </span>
                  </label>
                  {playerInId && (
                    <p className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-[10px] font-semibold ${afterHalf ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"}`}>
                      {afterHalf && <AlertTriangle className="h-4 w-4 shrink-0" />}
                      {afterHalf
                        ? "A metade da partida já passou: quem entrar recebe apenas gols e assistências."
                        : "Quem entrar agora ainda recebe normalmente o resultado da partida."}
                    </p>
                  )}
                </section>
              )}
            </div>

            <div className="border-t border-border bg-surface p-3 sm:p-4">
              <button
                type="button"
                onClick={submit}
                disabled={loading || !teamId || !playerOutId}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-black text-background disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeftRight className="h-5 w-5" />}
                Confirmar substituição
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
