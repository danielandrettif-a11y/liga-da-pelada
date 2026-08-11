"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Loader2, X } from "@/components/icons";
import { substituteMatchPlayer } from "@/lib/actions/matches";
import type { MatchSubstitutionReason } from "@/lib/types";
import { isEntryResultEligible } from "@/lib/match-rules";

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

  const participantIds = useMemo(
    () => new Set((match.match_players || []).map((entry: any) => entry.player_id)),
    [match.match_players],
  );
  const activePlayers = (match.match_players || []).filter(
    (entry: any) => entry.team_id === teamId && entry.is_active,
  );
  const teams = match.round?.teams || [];
  const waitingTeamIds = new Set(
    teams.filter((team: any) => ![match.team_a_id, match.team_b_id].includes(team.id)).map((team: any) => team.id),
  );
  const originalTeamByPlayer = new Map<string, any>();
  for (const team of teams) {
    for (const teamPlayer of team.team_players || []) originalTeamByPlayer.set(teamPlayer.player_id, team);
  }
  const eligiblePlayers = (match.round?.round_players || [])
    .filter((entry: any) => entry.availability_status === "available")
    .filter((entry: any) => !participantIds.has(entry.player_id))
    .map((entry: any) => ({ ...entry, originalTeam: originalTeamByPlayer.get(entry.player_id) }))
    .filter((entry: any) => entry.players && entry.originalTeam && waitingTeamIds.has(entry.originalTeam.id))
    .sort((a: any, b: any) => a.players.name.localeCompare(b.players.name, "pt-BR"));

  function close() {
    if (loading) return;
    setOpen(false);
    setTeamId("");
    setPlayerOutId("");
    setPlayerInId("");
    setReason("tired");
    setMarkInjured(false);
    setError("");
  }

  async function submit() {
    if (!teamId || !playerOutId) {
      setError("Escolha o time e quem vai sair.");
      return;
    }
    if (!playerInId && !confirm("Nenhum substituto foi escolhido. O time ficara com um jogador a menos. Continuar?")) return;

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
      setError(result.error || "Nao foi possivel fazer a substituicao.");
      setLoading(false);
      return;
    }
    setLoading(false);
    setOpen(false);
    setTeamId("");
    setPlayerOutId("");
    setPlayerInId("");
    setReason("tired");
    setMarkInjured(false);
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
        Fazer substituicao
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-background/85 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center">
          <div className="glass-card flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden animate-slide-in-bottom">
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
              <div>
                <h3 className="font-black text-foreground">Substituicao temporaria</h3>
                <p className="text-[10px] font-semibold text-muted">Quem sair nao podera voltar nesta partida.</p>
              </div>
              <button type="button" onClick={close} className="rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {error && <p className="rounded-xl bg-danger/10 p-3 text-xs font-semibold text-danger" role="alert">{error}</p>}

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">1. Qual time?</p>
                <div className="grid grid-cols-2 gap-2">
                  {[match.team_a, match.team_b].map((team: any) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => { setTeamId(team.id); setPlayerOutId(""); }}
                      className={`rounded-xl border p-3 text-sm font-black transition-colors ${teamId === team.id ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-foreground"}`}
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              </div>

              {teamId && (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">2. Quem vai sair?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {activePlayers.map((entry: any) => (
                      <button
                        key={entry.player_id}
                        type="button"
                        onClick={() => setPlayerOutId(entry.player_id)}
                        className={`truncate rounded-xl border p-3 text-left text-xs font-bold transition-colors ${playerOutId === entry.player_id ? "border-danger bg-danger/10 text-danger" : "border-border bg-background text-foreground"}`}
                      >
                        {entry.player?.name || "Jogador"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {playerOutId && (
                <>
                  <div>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">3. Motivo</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["tired", "Cansaco"],
                        ["injury", "Lesao"],
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
                    <label className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-background p-3">
                      <input
                        type="checkbox"
                        checked={markInjured}
                        onChange={(event) => setMarkInjured(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>
                        <span className="block text-xs font-bold text-foreground">Marcar como machucado</span>
                        <span className="block text-[10px] leading-relaxed text-muted">Ficara fora das proximas partidas ate ser liberado na rodada.</span>
                      </span>
                    </label>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">4. Quem entra?</p>
                    <select
                      value={playerInId}
                      onChange={(event) => setPlayerInId(event.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none focus:border-accent"
                    >
                      <option value="">Sair sem substituto</option>
                      {eligiblePlayers.map((entry: any) => (
                        <option key={entry.player_id} value={entry.player_id}>
                          {entry.players.name} · {entry.originalTeam.name}
                        </option>
                      ))}
                    </select>
                    {playerInId && (
                      <p className={`mt-2 flex items-start gap-2 rounded-xl p-3 text-[10px] font-semibold ${afterHalf ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"}`}>
                        {afterHalf && <AlertTriangle className="h-4 w-4 shrink-0" />}
                        {afterHalf
                          ? "A metade da partida ja passou: quem entrar recebe apenas gols e assistencias."
                          : "Quem entrar agora ainda recebe normalmente o resultado da partida."}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-border bg-surface p-4">
              <button
                type="button"
                onClick={submit}
                disabled={loading || !teamId || !playerOutId}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-black text-background disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeftRight className="h-5 w-5" />}
                Confirmar substituicao
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
