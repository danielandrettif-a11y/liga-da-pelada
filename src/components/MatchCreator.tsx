"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatch } from "@/lib/actions/matches";
import { Swords, ArrowLeft, ChevronRight, ChevronDown, AlertTriangle, Check, ArrowLeftRight, Crown, Users } from "@/components/icons";
import Link from "next/link";
import { TeamCrest } from "./TeamCrest";
import { markRoundTeamArrived, setRoundTeamCaptain, setRoundTeamVestColor, swapRoundTeamPlayers } from "@/lib/actions/rounds";
import { VEST_COLORS } from "@/lib/vest-colors";
import { pickFairSubstitute } from "@/lib/substitution-draw";

export function MatchCreator({ round }: { round: any }) {
  const router = useRouter();
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [replacementByAbsent, setReplacementByAbsent] = useState<Record<string, string>>({});
  const [swapPlayerAId, setSwapPlayerAId] = useState("");
  const [swapPlayerBId, setSwapPlayerBId] = useState("");
  const [swapPanelOpen, setSwapPanelOpen] = useState(false);
  const [swapFeedback, setSwapFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [managementLoading, setManagementLoading] = useState(false);
  const [captainByTeam, setCaptainByTeam] = useState<Record<string, string>>(() => Object.fromEntries(
    (round?.teams || []).map((team: any) => [team.id, team.captain_player_id || ""]),
  ));
  const [goalkeeperByTeam, setGoalkeeperByTeam] = useState<Record<string, string>>({});
  const [goalkeeperModeByTeam, setGoalkeeperModeByTeam] = useState<Record<string, "bq" | "manual">>({});
  const [colorByTeam, setColorByTeam] = useState<Record<string, string>>(() => Object.fromEntries(
    (round?.teams || []).map((team: any) => [team.id, team.color || "#22c55e"]),
  ));
  const [substitutionNotice, setSubstitutionNotice] = useState<Array<{ absent: string; replacement: string }> | null>(null);

  const teams = useMemo(() => round?.teams || [], [round?.teams]);
  const playerTeamById = useMemo(() => new Map(
    teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => [entry.player_id, team.id] as const)),
  ), [teams]);
  const selectedTeamIds = useMemo(() => [teamAId, teamBId].filter(Boolean), [teamAId, teamBId]);
  const availability = useMemo(() => new Map(
    (round?.round_players || []).map((entry: any) => [entry.player_id, entry.availability_status || "available"]),
  ), [round?.round_players]);
  const attendance = useMemo(() => new Map(
    (round?.round_players || []).map((entry: any) => [entry.player_id, entry.attendance_status || "pending"]),
  ), [round?.round_players]);
  // Apenas uma rodada que realmente registrou uma ordem de chegada deve
  // exigir os dois times titulares no primeiro jogo. Sorteios aleatório e
  // equilibrado deixam os três times disponíveis desde o início.
  const tracksAttendance = round?.formation_mode !== "manual";
  const usesArrivalOrder = round?.arrival_order_enabled === true;
  const previousMatch = useMemo(() => [...(round?.matches || [])].sort((a: any, b: any) =>
    (b.match_order || 0) - (a.match_order || 0) || String(b.created_at).localeCompare(String(a.created_at)),
  )[0], [round?.matches]);
  const firstMatchAllowedIds = new Set(teams.filter((team: any) => (team.position || 0) <= 2).map((team: any) => team.id));
  const selectedTeams = teams.filter((team: any) => selectedTeamIds.includes(team.id));
  const injuredPlayers = selectedTeams.flatMap((team: any) =>
    (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "injured" || (tracksAttendance && attendance.get(entry.player_id) !== "present"))
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id, reason: availability.get(entry.player_id) === "injured" ? "Machucado" : "Ainda nao chegou" })),
  );
  const outgoingTeamIds = previousMatch
    ? [previousMatch.team_a_id, previousMatch.team_b_id].filter((id: string) => !selectedTeamIds.includes(id))
    : teams.filter((team: any) => !selectedTeamIds.includes(team.id)).map((team: any) => team.id);
  const waitingPlayers = teams
    .filter((team: any) => outgoingTeamIds.includes(team.id))
    .flatMap((team: any) => (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "available" && (!tracksAttendance || attendance.get(entry.player_id) === "present"))
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id })))
    .filter((entry: any) => entry.player);
  const previousLoanCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of round?.matches || []) {
      for (const player of match.match_players || []) {
        if (player.original_team_id && player.team_id !== player.original_team_id) {
          counts.set(player.player_id, (counts.get(player.player_id) || 0) + 1);
        }
      }
    }
    return counts;
  }, [round?.matches]);
  const eligibleGoalkeepersByTeam = useMemo(() => Object.fromEntries(teams.map((team: any) => {
    const players = (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) !== "injured" && (!tracksAttendance || attendance.get(entry.player_id) === "present"))
      .map((entry: any) => ({
        id: entry.player_id,
        name: entry.players?.name || "Jogador",
        isGoalkeeper: Boolean(entry.players?.is_goalkeeper),
        goalkeeperOrder: Number(entry.goalkeeper_order || Number.MAX_SAFE_INTEGER),
      }));
    for (const [absentId, replacementId] of Object.entries(replacementByAbsent)) {
      const absentTeamId = playerTeamById.get(absentId);
      if (absentTeamId !== team.id || !replacementId) continue;
      const replacement = waitingPlayers.find((entry: any) => entry.playerId === replacementId);
      if (replacement && !players.some((player: any) => player.id === replacementId)) {
        players.push({
          id: replacementId,
          name: replacement.player.name,
          isGoalkeeper: Boolean(replacement.player.is_goalkeeper),
          goalkeeperOrder: Number((team.team_players || []).find((item: any) => item.player_id === absentId)?.goalkeeper_order || Number.MAX_SAFE_INTEGER),
        });
      }
    }
    return [team.id, players];
  })), [teams, availability, attendance, tracksAttendance, replacementByAbsent, playerTeamById, waitingPlayers]);

  const bqGoalkeeperSuggestionByTeam = useMemo(() => Object.fromEntries(teams.map((team: any) => {
    const rotation = [...(team.team_players || [])]
      .map((entry: any) => ({
        id: replacementByAbsent[entry.player_id] || entry.player_id,
        order: Number(entry.goalkeeper_order || Number.MAX_SAFE_INTEGER),
      }))
      .sort((a, b) => a.order - b.order);
    const eligible = [...(eligibleGoalkeepersByTeam[team.id] || [])]
      .sort((a: any, b: any) => a.goalkeeperOrder - b.goalkeeperOrder || a.name.localeCompare(b.name, "pt-BR"));
    if (!rotation.length || !eligible.length) return [team.id, null] as const;

    const lastMatchWithGoalkeeper = [...(round?.matches || [])]
      .filter((item: any) => item.team_a_id === team.id || item.team_b_id === team.id)
      .sort((a: any, b: any) =>
        new Date(b.started_at || b.created_at || 0).getTime() - new Date(a.started_at || a.created_at || 0).getTime(),
      )
      .find((item: any) => (item.match_goalkeepers || []).some((goalkeeper: any) => goalkeeper.team_id === team.id));
    const lastGoalkeeper = lastMatchWithGoalkeeper?.match_goalkeepers?.find((goalkeeper: any) => goalkeeper.team_id === team.id);
    const lastIndex = lastGoalkeeper
      ? rotation.findIndex((entry: any) => entry.id === lastGoalkeeper.player_id)
      : -1;

    for (let offset = 1; offset <= rotation.length; offset += 1) {
      const candidate = rotation[(Math.max(lastIndex, -1) + offset) % rotation.length];
      const availableCandidate = eligible.find((player: any) => player.id === candidate.id);
      if (availableCandidate) return [team.id, { ...availableCandidate, order: candidate.order }] as const;
    }

    return [team.id, null] as const;
  })), [teams, eligibleGoalkeepersByTeam, round?.matches, replacementByAbsent]);

  useEffect(() => {
    setReplacementByAbsent({});
    setSubstitutionNotice(null);
  }, [teamAId, teamBId]);

  const missingSubstitutionKey = injuredPlayers
    .filter((entry: any) => !replacementByAbsent[entry.playerId])
    .map((entry: any) => entry.playerId)
    .sort()
    .join("|");
  const waitingPlayerKey = waitingPlayers.map((entry: any) => entry.playerId).sort().join("|");

  useEffect(() => {
    if (selectedTeamIds.length !== 2 || !missingSubstitutionKey || !waitingPlayerKey) return;
    const usedNow = new Set(Object.values(replacementByAbsent).filter(Boolean));
    const next = { ...replacementByAbsent };
    const notice: Array<{ absent: string; replacement: string }> = [];
    for (const entry of injuredPlayers.filter((item: any) => !next[item.playerId])) {
      const picked = pickFairSubstitute<{ playerId: string; player: any; team: any }>(waitingPlayers, previousLoanCount, usedNow);
      if (!picked) continue;
      next[entry.playerId] = picked.playerId;
      usedNow.add(picked.playerId);
      notice.push({ absent: entry.player?.name || "Jogador", replacement: picked.player?.name || "Jogador" });
    }
    if (notice.length) {
      setReplacementByAbsent(next);
      setSubstitutionNotice(notice);
    }
  // A chave muda apenas quando os participantes da escolha mudam.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingSubstitutionKey, waitingPlayerKey, selectedTeamIds.length]);

  useEffect(() => {
    setGoalkeeperByTeam((current) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const teamId of selectedTeamIds) {
        const suggested = bqGoalkeeperSuggestionByTeam[teamId];
        const eligible = eligibleGoalkeepersByTeam[teamId] || [];
        const currentPlayerId = current[teamId];
        const currentMode = goalkeeperModeByTeam[teamId];
        const keepsManualChoice = currentMode === "manual" && eligible.some((player: any) => player.id === currentPlayerId);
        const nextPlayerId = keepsManualChoice ? currentPlayerId : suggested?.id || currentPlayerId || "";
        next[teamId] = nextPlayerId;
        if (nextPlayerId !== currentPlayerId) changed = true;
      }
      return changed ? next : current;
    });
    setGoalkeeperModeByTeam((current) => {
      const next: Record<string, "bq" | "manual"> = {};
      let changed = false;
      for (const teamId of selectedTeamIds) {
        const nextMode = current[teamId] || "bq";
        next[teamId] = nextMode;
        if (nextMode !== current[teamId]) changed = true;
      }
      return changed ? next : current;
    });
  }, [selectedTeamIds, bqGoalkeeperSuggestionByTeam, eligibleGoalkeepersByTeam, goalkeeperModeByTeam]);

  useEffect(() => {
    setCaptainByTeam(Object.fromEntries(
      teams.map((team: any) => [team.id, team.captain_player_id || ""]),
    ));
  }, [teams]);

  async function handleStart() {
    if (!teamAId || !teamBId) {
      setError("Selecione os dois times para iniciar.");
      return;
    }
    if (teamAId === teamBId) {
      setError("Os times devem ser diferentes.");
      return;
    }
    if (!goalkeeperByTeam[teamAId] || !goalkeeperByTeam[teamBId]) {
      setError("Escolha o goleiro de cada time antes de apitar.");
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
      goalkeeper_a_id: goalkeeperByTeam[teamAId],
      goalkeeper_b_id: goalkeeperByTeam[teamBId],
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
    setSwapFeedback(null);
    const result = await swapRoundTeamPlayers(round.id, swapPlayerAId, swapPlayerBId);
    if (!result.success) {
      setSwapFeedback({ type: "error", message: result.error || "Não foi possível realizar a troca." });
    }
    else {
      setSwapPlayerAId("");
      setSwapPlayerBId("");
      setSwapFeedback({ type: "success", message: "Troca realizada. Os próximos jogos já usarão os novos times." });
      router.refresh();
    }
    setManagementLoading(false);
  }

  function selectSwapPlayer(playerId: string, teamId: string) {
    setSwapFeedback(null);
    if (swapPlayerAId === playerId) {
      setSwapPlayerAId("");
      return;
    }
    if (swapPlayerBId === playerId) {
      setSwapPlayerBId("");
      return;
    }
    const firstTeamId = playerTeamById.get(swapPlayerAId);
    const secondTeamId = playerTeamById.get(swapPlayerBId);
    if (!swapPlayerAId || firstTeamId === teamId) setSwapPlayerAId(playerId);
    else if (!swapPlayerBId || secondTeamId === teamId) setSwapPlayerBId(playerId);
    else setSwapPlayerBId(playerId);
    setError("");
  }

  async function handleCaptainChange(teamId: string, playerId: string) {
    const previous = captainByTeam[teamId] || "";
    setCaptainByTeam((current) => ({ ...current, [teamId]: playerId }));
    setManagementLoading(true);
    setError("");
    const result = await setRoundTeamCaptain(round.id, teamId, playerId || null);
    if (!result.success) {
      setCaptainByTeam((current) => ({ ...current, [teamId]: previous }));
      setError(result.error || "Nao foi possivel definir o capitao.");
    } else {
      router.refresh();
    }
    setManagementLoading(false);
  }

  async function handleVestColorChange(teamId: string, color: string) {
    const previous = colorByTeam[teamId];
    setColorByTeam((current) => ({ ...current, [teamId]: color }));
    setManagementLoading(true);
    setError("");
    const result = await setRoundTeamVestColor(round.id, teamId, color);
    if (!result.success) {
      setColorByTeam((current) => ({ ...current, [teamId]: previous }));
      setError(result.error || "Nao foi possivel definir a cor do colete.");
    } else router.refresh();
    setManagementLoading(false);
  }

  return (
    <div className="space-y-6">
      {substitutionNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sorteio de substituição">
          <div className="w-full max-w-sm rounded-3xl border border-warning/35 bg-[#07150d] p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/15 text-warning"><ArrowLeftRight className="h-5 w-5" /></span>
              <div><h2 className="text-base font-black text-foreground">Substituição sorteada</h2><p className="text-[10px] font-semibold text-muted">Quem foi menos sorteado teve prioridade.</p></div>
            </div>
            <div className="mt-4 space-y-2">
              {substitutionNotice.map((item) => (
                <div key={`${item.absent}-${item.replacement}`} className="rounded-xl border border-border bg-surface p-3 text-xs font-bold text-foreground">
                  <span className="text-danger">{item.absent}</span><span className="px-2 text-muted">→</span><span className="text-accent">{item.replacement}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setSubstitutionNotice(null)} className="mt-4 w-full rounded-xl bg-accent py-3 text-xs font-black uppercase text-background">Continuar</button>
          </div>
        </div>
      )}
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

      <section className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Crown className="h-4.5 w-4.5" /></span>
          <div><h2 className="text-sm font-black text-foreground">Identidade dos times</h2><p className="text-[10px] text-muted">Escolha o colete e o capitão de referência no mesmo lugar.</p></div>
        </div>
        <div className="divide-y divide-border">
          {teams.map((team: any) => (
            <div key={team.id} className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
              <TeamCrest name={team.name} crestUrl={team.crest_url} color={colorByTeam[team.id] || team.color} className="h-9 w-9 shrink-0 row-span-2 sm:row-span-1" />
              <span className="min-w-0 flex-1 truncate text-xs font-black text-foreground">{team.name}</span>
              <label className="col-start-2 flex min-w-0 items-center gap-2 sm:col-start-auto">
                <span className="text-[9px] font-black uppercase text-muted">Colete</span>
                <select value={colorByTeam[team.id] || team.color} onChange={(event) => handleVestColorChange(team.id, event.target.value)} disabled={managementLoading} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-2 text-[10px] font-bold text-foreground disabled:opacity-50 sm:w-28">
                  {VEST_COLORS.map((item) => <option key={item.color} value={item.color}>{item.label}</option>)}
                </select>
              </label>
              <label className="col-start-2 flex min-w-0 items-center gap-2 sm:col-start-auto">
                <span className="text-[9px] font-black uppercase text-muted">Capitão</span>
              <select
                value={captainByTeam[team.id] || ""}
                onChange={(event) => handleCaptainChange(team.id, event.target.value)}
                disabled={managementLoading}
                aria-label={`Capitão do ${team.name}`}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-2 text-[10px] font-bold text-foreground disabled:opacity-50 sm:w-32"
              >
                <option value="">Sem capitão</option>
                {(team.team_players || []).map((entry: any) => <option key={entry.player_id} value={entry.player_id}>{entry.players?.name}</option>)}
              </select>
              </label>
            </div>
          ))}
        </div>
      </section>

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
            {teams.map((t: any) => {
              const isSelected = teamAId === t.id;
              const isDisabled = teamBId === t.id || (!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id));
              const vestColor = colorByTeam[t.id] || t.color || "#CCFF00";

              return (
                <button
                  key={t.id}
                  onClick={() => setTeamAId(t.id)}
                  style={{
                    backgroundColor: isSelected ? `${vestColor}30` : `${vestColor}0d`,
                    borderColor: isSelected ? vestColor : `${vestColor}35`,
                    boxShadow: isSelected ? `0 0 16px ${vestColor}45` : undefined,
                  }}
                  className={`
                    p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all duration-200
                    ${isSelected ? "scale-[1.03] ring-1 ring-white/20" : "hover:border-white/30 hover:bg-surface-hover"}
                    ${teamBId === t.id ? "opacity-40 cursor-not-allowed" : ""}
                    ${!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id) ? "opacity-35 cursor-not-allowed" : ""}
                  `}
                  disabled={isDisabled}
                >
                  <TeamCrest name={t.name} crestUrl={t.crest_url} color={vestColor} className="h-11 w-11" />
                  <span className="text-xs font-black truncate w-full text-center text-foreground">{t.name}</span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black uppercase"
                    style={{
                      backgroundColor: `${vestColor}25`,
                      color: vestColor,
                      border: `1px solid ${vestColor}50`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: vestColor }} />
                    Colete
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-[8px] font-black uppercase text-accent">
                    <Crown className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{(t.team_players || []).find((entry: any) => entry.player_id === captainByTeam[t.id])?.players?.name || "Sem capitão"}</span>
                  </span>
                </button>
              );
            })}
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
            {teams.map((t: any) => {
              const isSelected = teamBId === t.id;
              const isDisabled = teamAId === t.id || (!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id));
              const vestColor = colorByTeam[t.id] || t.color || "#CCFF00";

              return (
                <button
                  key={t.id}
                  onClick={() => setTeamBId(t.id)}
                  style={{
                    backgroundColor: isSelected ? `${vestColor}30` : `${vestColor}0d`,
                    borderColor: isSelected ? vestColor : `${vestColor}35`,
                    boxShadow: isSelected ? `0 0 16px ${vestColor}45` : undefined,
                  }}
                  className={`
                    p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all duration-200
                    ${isSelected ? "scale-[1.03] ring-1 ring-white/20" : "hover:border-white/30 hover:bg-surface-hover"}
                    ${teamAId === t.id ? "opacity-40 cursor-not-allowed" : ""}
                    ${!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id) ? "opacity-35 cursor-not-allowed" : ""}
                  `}
                  disabled={isDisabled}
                >
                  <TeamCrest name={t.name} crestUrl={t.crest_url} color={vestColor} className="h-11 w-11" />
                  <span className="text-xs font-black truncate w-full text-center text-foreground">{t.name}</span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black uppercase"
                    style={{
                      backgroundColor: `${vestColor}25`,
                      color: vestColor,
                      border: `1px solid ${vestColor}50`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: vestColor }} />
                    Colete
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-[8px] font-black uppercase text-accent">
                    <Crown className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{(t.team_players || []).find((entry: any) => entry.player_id === captainByTeam[t.id])?.players?.name || "Sem capitão"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      <section className="glass-card overflow-hidden">
        <button
          type="button"
          onClick={() => setSwapPanelOpen((current) => !current)}
          aria-expanded={swapPanelOpen}
          aria-controls="permanent-swap-panel"
          className={`flex w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-hover ${swapPanelOpen ? "border-b border-border" : ""}`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 text-warning"><ArrowLeftRight className="h-4.5 w-4.5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-foreground">Troca permanente</h2>
            <p className="text-[10px] text-muted">{swapPanelOpen ? "Escolha um jogador de cada time." : "Toque para abrir e trocar dois jogadores de time."}</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${swapPanelOpen ? "rotate-180" : ""}`} />
        </button>
        {swapPanelOpen && <div id="permanent-swap-panel" className="grid gap-3 p-4 sm:grid-cols-2">
          {teams.map((team: any) => (
            <div key={team.id} className="overflow-hidden rounded-xl border border-border bg-background/45">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <TeamCrest name={team.name} crestUrl={team.crest_url} color={team.color} className="h-7 w-7" />
                <span className="min-w-0 flex-1 truncate text-xs font-black text-foreground">{team.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-2">
                {(team.team_players || []).map((entry: any) => {
                  const position = swapPlayerAId === entry.player_id ? 1 : swapPlayerBId === entry.player_id ? 2 : 0;
                  return (
                    <button
                      key={entry.player_id}
                      type="button"
                      onClick={() => selectSwapPlayer(entry.player_id, team.id)}
                      className={`relative min-w-0 rounded-lg border px-2 py-2 text-left text-[10px] font-bold transition-colors ${position ? "border-warning bg-warning/10 text-warning" : "border-border bg-surface text-foreground"}`}
                    >
                      <span className="block truncate">{entry.players?.name}</span>
                      {position > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[8px] font-black text-background">{position}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {swapFeedback && (
            <p role="status" className={`rounded-xl p-3 text-center text-[10px] font-bold sm:col-span-2 ${swapFeedback.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              {swapFeedback.message}
            </p>
          )}
          <button type="button" disabled={managementLoading || !swapPlayerAId || !swapPlayerBId} onClick={handlePermanentSwap} className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs font-black text-warning disabled:opacity-40 sm:col-span-2">
            {managementLoading ? "Salvando..." : "Confirmar troca entre os times"}
          </button>
        </div>}
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
              {tracksAttendance && [...new Set(injuredPlayers.filter((entry: any) => entry.reason === "Ainda nao chegou").map((entry: any) => entry.team.id))].map((teamId: any) => {
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

      {selectedTeamIds.length === 2 && (
        <section className="glass-card overflow-hidden animate-fade-in-up">
          <div className="border-b border-border bg-surface px-4 py-3">
            <h2 className="text-sm font-black text-foreground">🧤 Goleiros da partida</h2>
            <p className="mt-1 text-[10px] font-semibold text-muted">Cada goleiro recebe +3 por atuar e −1 por gol sofrido.</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {selectedTeams.map((team: any) => (
              <label key={team.id} className="block">
                <span className="mb-2 flex items-center gap-2 text-xs font-black text-foreground">
                  <TeamCrest name={team.name} crestUrl={team.crest_url} color={team.color} className="h-6 w-6" />
                  {team.name}
                </span>
                <select
                  value={goalkeeperModeByTeam[team.id] === "bq" && bqGoalkeeperSuggestionByTeam[team.id]
                    ? "__bq_rotation__"
                    : goalkeeperByTeam[team.id] || ""}
                  onChange={(event) => {
                    const useBqRotation = event.target.value === "__bq_rotation__";
                    const suggested = bqGoalkeeperSuggestionByTeam[team.id];
                    setGoalkeeperByTeam((current) => ({
                      ...current,
                      [team.id]: useBqRotation ? suggested?.id || "" : event.target.value,
                    }));
                    setGoalkeeperModeByTeam((current) => ({ ...current, [team.id]: useBqRotation ? "bq" : "manual" }));
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none focus:border-accent"
                >
                  {bqGoalkeeperSuggestionByTeam[team.id] && (
                    <option value="__bq_rotation__">
                      Seguir ordem BQ · {bqGoalkeeperSuggestionByTeam[team.id].name} · fila {bqGoalkeeperSuggestionByTeam[team.id].order}
                    </option>
                  )}
                  {!bqGoalkeeperSuggestionByTeam[team.id] && <option value="">Quem começa no gol?</option>}
                  {(eligibleGoalkeepersByTeam[team.id] || [])
                    .sort((a: any, b: any) => a.goalkeeperOrder - b.goalkeeperOrder || a.name.localeCompare(b.name, "pt-BR"))
                    .map((player: any) => <option key={player.id} value={player.id}>{player.name}{Number.isFinite(player.goalkeeperOrder) ? ` · fila ${player.goalkeeperOrder}` : ""}</option>)}
                </select>
                {bqGoalkeeperSuggestionByTeam[team.id] && (
                  <span className="mt-1.5 block text-[9px] font-semibold leading-relaxed text-muted">
                    A sugestão usa o próximo da fila após o último goleiro deste time. Você pode escolher outro nome na lista.
                  </span>
                )}
              </label>
            ))}
          </div>
        </section>
      )}

      <button
        onClick={handleStart}
        disabled={loading || !teamAId || !teamBId || !goalkeeperByTeam[teamAId] || !goalkeeperByTeam[teamBId]}
        className="w-full bg-accent hover:bg-accent-light text-background font-bold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
      >
        {loading ? "Criando..." : "Apita o Árbitro!"}
        <ChevronRight className="w-5 h-5" />
      </button>

    </div>
  );
}
