"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatch, findLiveMatchForTeams, setRoundTeamFixedGoalkeeper } from "@/lib/actions/matches";
import { Swords, ArrowLeft, ChevronRight, AlertTriangle, Check, ArrowLeftRight, Crown } from "@/components/icons";
import Link from "next/link";
import { TeamCrest } from "./TeamCrest";
import { TeamReferenceBadge } from "./TeamReferenceBadge";
import { canTeamLendToMatch, pickFairSubstitute } from "@/lib/substitution-draw";
import { buildStructuralLoans } from "@/lib/underfilled-rounds";
import { shouldExcludeReplacementScoring } from "@/lib/scoring-eligibility";

type MatchCreatorProps = {
  round: any;
  initialTeamIds?: [string, string];
  quickStart?: boolean;
  embedded?: boolean;
  onCancel?: () => void;
  draftStorageKey?: string;
  onSyncStateChange?: (syncing: boolean) => void;
};

type CreationIntent = {
  fingerprint: string;
  key: string;
  startedAt: string;
};

export function MatchCreator({
  round,
  initialTeamIds,
  quickStart = false,
  embedded = false,
  onCancel,
  draftStorageKey,
  onSyncStateChange,
}: MatchCreatorProps) {
  const router = useRouter();
  const [teamAId, setTeamAId] = useState<string>(initialTeamIds?.[0] || "");
  const [teamBId, setTeamBId] = useState<string>(initialTeamIds?.[1] || "");
  const [loading, setLoading] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [provisionalKickoffAt, setProvisionalKickoffAt] = useState<string | null>(null);
  const [provisionalNow, setProvisionalNow] = useState(() => Date.now());
  const [confirmedMatchId, setConfirmedMatchId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [replacementByAbsent, setReplacementByAbsent] = useState<Record<string, string>>({});
  const [structuralLoanOverrideBySlot, setStructuralLoanOverrideBySlot] = useState<Record<string, string>>({});
  const [declinedStructuralPlayerIds, setDeclinedStructuralPlayerIds] = useState<string[]>([]);
  const [managementLoading, setManagementLoading] = useState(false);
  const [captainByTeam, setCaptainByTeam] = useState<Record<string, string>>(() => Object.fromEntries(
    (round?.teams || []).map((team: any) => [team.id, team.captain_player_id || ""]),
  ));
  const [goalkeeperByTeam, setGoalkeeperByTeam] = useState<Record<string, string>>({});
  const [goalkeeperModeByTeam, setGoalkeeperModeByTeam] = useState<Record<string, "bq" | "manual">>({});
  const [fixedGoalkeeperByTeam, setFixedGoalkeeperByTeam] = useState<Record<string, string>>(() => Object.fromEntries(
    (round?.teams || []).map((team: any) => [team.id, team.fixed_goalkeeper_player_id || ""]),
  ));
  const [colorByTeam, setColorByTeam] = useState<Record<string, string>>(() => Object.fromEntries(
    (round?.teams || []).map((team: any) => [team.id, team.color || "#22c55e"]),
  ));
  const [substitutionNotice, setSubstitutionNotice] = useState<Array<{ absent: string; replacement: string }> | null>(null);
  const creationIntentRef = useRef<CreationIntent | null>(null);
  const restoringDraftRef = useRef(false);
  const [draftReady, setDraftReady] = useState(!draftStorageKey);

  const teams = useMemo(() => round?.teams || [], [round?.teams]);
  const leagueConfig = Array.isArray(round?.league) ? round.league[0] : round?.league;
  const targetPlayersPerTeam = Number(round?.target_players_per_team || leagueConfig?.players_per_team || 6);
  const replacementsDoNotScore = shouldExcludeReplacementScoring(round?.number);
  const playerTeamById = useMemo(() => new Map(
    teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => [entry.player_id, team.id] as const)),
  ), [teams]);
  const selectedTeamIds = useMemo(() => [teamAId, teamBId].filter(Boolean), [teamAId, teamBId]);
  const availability = useMemo(() => new Map(
    (round?.round_players || []).map((entry: any) => [entry.player_id, entry.availability_status || "available"]),
  ), [round?.round_players]);
  const usesArrivalOrder = false;
  const previousMatch = useMemo(() => [...(round?.matches || [])].sort((a: any, b: any) =>
    (b.match_order || 0) - (a.match_order || 0) || String(b.created_at).localeCompare(String(a.created_at)),
  )[0], [round?.matches]);
  const firstMatchAllowedIds = new Set(teams.filter((team: any) => (team.position || 0) <= 2).map((team: any) => team.id));
  const selectedTeams = useMemo(
    () => teams.filter((team: any) => selectedTeamIds.includes(team.id)),
    [teams, selectedTeamIds],
  );
  const injuredPlayers = useMemo(() => selectedTeams.flatMap((team: any) =>
    (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "injured")
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id, reason: "Machucado" })),
  ), [selectedTeams, availability]);
  // Cobertura de desfalque não depende do rodízio do último jogo: qualquer
  // atleta presente de um time que não participa deste confronto pode entrar.
  // A API repete a validação para impedir que a regra seja burlada pelo cliente.
  const lenderTeamIds = teams
    .filter((team: any) => canTeamLendToMatch(team.id, selectedTeamIds))
    .map((team: any) => team.id);
  const waitingPlayers = teams
    .filter((team: any) => lenderTeamIds.includes(team.id))
    .flatMap((team: any) => (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) === "available")
      .map((entry: any) => ({ team, player: entry.players, playerId: entry.player_id })))
    .filter((entry: any) => entry.player);
  const forcedAbsenceGoalkeeperByTeam = useMemo(() => {
    const forced = new Map<string, string>();
    for (const entry of injuredPlayers) {
      const replacementId = replacementByAbsent[entry.playerId];
      if (replacementId && !forced.has(entry.team.id)) forced.set(entry.team.id, replacementId);
    }
    return forced;
  }, [injuredPlayers, replacementByAbsent]);
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
  const structuralLoans = useMemo(() => buildStructuralLoans({
    teams: teams.map((team: any) => ({
      id: team.id,
      position: Number(team.position || 0),
      players: (team.team_players || []).map((entry: any, index: number) => ({
        playerId: entry.player_id,
        loanOrder: Number(entry.loan_order || entry.goalkeeper_order || index + 1),
        eligible: availability.get(entry.player_id) === "available",
      })),
    })),
    selectedTeamIds,
    targetPlayersPerTeam,
    previousLoanCount,
    reservedPlayerIds: new Set([...Object.values(replacementByAbsent).filter(Boolean), ...declinedStructuralPlayerIds]),
    preferredPlayerBySlot: new Map(Object.entries(structuralLoanOverrideBySlot)),
  }), [teams, selectedTeamIds, targetPlayersPerTeam, previousLoanCount, replacementByAbsent, declinedStructuralPlayerIds, structuralLoanOverrideBySlot, availability]);
  const structuralShortage = selectedTeams.reduce(
    (total: number, team: any) => total + Math.max(0, targetPlayersPerTeam - (team.team_players || []).length),
    0,
  );
  const teamPlayerById = useMemo(() => new Map(
    teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => [entry.player_id, entry.players] as const)),
  ), [teams]);
  const eligibleGoalkeepersByTeam = useMemo(() => Object.fromEntries(teams.map((team: any) => {
    const loanStartsGoalkeeperQueue = structuralLoans.some((loan) =>
      loan.targetTeamId === team.id && loan.rotationOrder === 1,
    );
    const players = (team.team_players || [])
      .filter((entry: any) => availability.get(entry.player_id) !== "injured")
      .map((entry: any) => ({
        id: entry.player_id,
        name: entry.players?.name || "Jogador",
        isGoalkeeper: Boolean(entry.players?.is_goalkeeper),
        goalkeeperOrder: Number(entry.goalkeeper_order || Number.MAX_SAFE_INTEGER) + (loanStartsGoalkeeperQueue ? 1 : 0),
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
          goalkeeperOrder: Number((team.team_players || []).find((item: any) => item.player_id === absentId)?.goalkeeper_order || Number.MAX_SAFE_INTEGER) + (loanStartsGoalkeeperQueue ? 1 : 0),
        });
      }
    }
    for (const loan of structuralLoans.filter((item) => item.targetTeamId === team.id)) {
      const player = teamPlayerById.get(loan.playerId) as any;
      if (player && !players.some((entry: any) => entry.id === loan.playerId)) {
        players.push({
          id: loan.playerId,
          name: player.name,
          isGoalkeeper: Boolean(player.is_goalkeeper),
          goalkeeperOrder: loan.rotationOrder,
        });
      }
    }
    return [team.id, players];
  })), [teams, availability, replacementByAbsent, playerTeamById, waitingPlayers, structuralLoans, teamPlayerById]);

  const bqGoalkeeperSuggestionByTeam = useMemo(() => Object.fromEntries(teams.map((team: any) => {
    const loanStartsGoalkeeperQueue = structuralLoans.some((loan) =>
      loan.targetTeamId === team.id && loan.rotationOrder === 1,
    );
    const rotation = [...(team.team_players || [])]
      .map((entry: any) => ({
        id: replacementByAbsent[entry.player_id] || entry.player_id,
        order: Number(entry.goalkeeper_order || Number.MAX_SAFE_INTEGER) + (loanStartsGoalkeeperQueue ? 1 : 0),
      }))
      .sort((a, b) => a.order - b.order);
    for (const loan of structuralLoans.filter((item) => item.targetTeamId === team.id)) {
      rotation.push({ id: loan.playerId, order: loan.rotationOrder });
    }
    rotation.sort((a, b) => a.order - b.order);
    const eligible = [...(eligibleGoalkeepersByTeam[team.id] || [])]
      .sort((a: any, b: any) => a.goalkeeperOrder - b.goalkeeperOrder || a.name.localeCompare(b.name, "pt-BR"));
    const forcedReplacementId = forcedAbsenceGoalkeeperByTeam.get(team.id);
    if (forcedReplacementId) {
      const forcedReplacement = eligible.find((player: any) => player.id === forcedReplacementId);
      if (forcedReplacement) return [team.id, { ...forcedReplacement, order: 0 }] as const;
    }
    if (!rotation.length || !eligible.length) return [team.id, null] as const;

    const lastMatchWithGoalkeeper = [...(round?.matches || [])]
      .filter((item: any) => item.team_a_id === team.id || item.team_b_id === team.id)
      .sort((a: any, b: any) =>
        new Date(b.started_at || b.created_at || 0).getTime() - new Date(a.started_at || a.created_at || 0).getTime(),
      )
      .find((item: any) => (item.match_goalkeepers || []).some((goalkeeper: any) => goalkeeper.team_id === team.id));
    const lastGoalkeeper = lastMatchWithGoalkeeper?.match_goalkeepers?.find((goalkeeper: any) => goalkeeper.team_id === team.id);
    const lastIndex = lastGoalkeeper
      ? rotation.findIndex((entry: any) => Number(lastGoalkeeper.rotation_order || 0) > 0
        ? entry.order === Number(lastGoalkeeper.rotation_order)
        : entry.id === lastGoalkeeper.player_id)
      : -1;

    for (let offset = 1; offset <= rotation.length; offset += 1) {
      const candidate = rotation[(Math.max(lastIndex, -1) + offset) % rotation.length];
      const availableCandidate = eligible.find((player: any) => player.id === candidate.id);
      if (availableCandidate) return [team.id, { ...availableCandidate, order: candidate.order }] as const;
    }

    return [team.id, null] as const;
  })), [teams, eligibleGoalkeepersByTeam, round?.matches, replacementByAbsent, structuralLoans, forcedAbsenceGoalkeeperByTeam]);

  useEffect(() => {
    if (restoringDraftRef.current) {
      restoringDraftRef.current = false;
      return;
    }
    setReplacementByAbsent({});
    setStructuralLoanOverrideBySlot({});
    setDeclinedStructuralPlayerIds([]);
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
        const forcedReplacementId = forcedAbsenceGoalkeeperByTeam.get(teamId);
        const fixedPlayerId = fixedGoalkeeperByTeam[teamId];
        const validFixedPlayerId = eligible.some((player: any) => player.id === fixedPlayerId) ? fixedPlayerId : "";
        const keepsManualChoice = !forcedReplacementId && !validFixedPlayerId && currentMode === "manual" && eligible.some((player: any) => player.id === currentPlayerId);
        const nextPlayerId = forcedReplacementId || validFixedPlayerId || (keepsManualChoice ? currentPlayerId : suggested?.id || currentPlayerId || "");
        next[teamId] = nextPlayerId;
        if (nextPlayerId !== currentPlayerId) changed = true;
      }
      return changed ? next : current;
    });
    setGoalkeeperModeByTeam((current) => {
      const next: Record<string, "bq" | "manual"> = {};
      let changed = false;
      for (const teamId of selectedTeamIds) {
        const nextMode = forcedAbsenceGoalkeeperByTeam.has(teamId) ? "bq" : current[teamId] || "bq";
        next[teamId] = nextMode;
        if (nextMode !== current[teamId]) changed = true;
      }
      return changed ? next : current;
    });
  }, [selectedTeamIds, bqGoalkeeperSuggestionByTeam, eligibleGoalkeepersByTeam, goalkeeperModeByTeam, forcedAbsenceGoalkeeperByTeam, fixedGoalkeeperByTeam]);

  useEffect(() => {
    setCaptainByTeam(Object.fromEntries(
      teams.map((team: any) => [team.id, team.captain_player_id || ""]),
    ));
  }, [teams]);

  useEffect(() => {
    if (!draftStorageKey) return;
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        restoringDraftRef.current = typeof draft.teamAId === "string" || typeof draft.teamBId === "string";
        if (typeof draft.teamAId === "string") setTeamAId(draft.teamAId);
        if (typeof draft.teamBId === "string") setTeamBId(draft.teamBId);
        if (draft.goalkeeperByTeam && typeof draft.goalkeeperByTeam === "object") {
          setGoalkeeperByTeam(draft.goalkeeperByTeam as Record<string, string>);
        }
        if (draft.goalkeeperModeByTeam && typeof draft.goalkeeperModeByTeam === "object") {
          setGoalkeeperModeByTeam(draft.goalkeeperModeByTeam as Record<string, "bq" | "manual">);
        }
        if (draft.replacementByAbsent && typeof draft.replacementByAbsent === "object") {
          setReplacementByAbsent(draft.replacementByAbsent as Record<string, string>);
        }
        if (draft.structuralLoanOverrideBySlot && typeof draft.structuralLoanOverrideBySlot === "object") {
          setStructuralLoanOverrideBySlot(draft.structuralLoanOverrideBySlot as Record<string, string>);
        }
        if (Array.isArray(draft.declinedStructuralPlayerIds)) {
          setDeclinedStructuralPlayerIds(draft.declinedStructuralPlayerIds.filter((id): id is string => typeof id === "string"));
        }
      }
    } catch {
      window.sessionStorage.removeItem(draftStorageKey);
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || !draftReady || provisionalKickoffAt) return;
    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify({
        teamAId,
        teamBId,
        goalkeeperByTeam,
        goalkeeperModeByTeam,
        replacementByAbsent,
        structuralLoanOverrideBySlot,
        declinedStructuralPlayerIds,
      }));
    } catch {
      // O rascunho é uma conveniência; falta de espaço não bloqueia a partida.
    }
  }, [declinedStructuralPlayerIds, draftReady, draftStorageKey, goalkeeperByTeam, goalkeeperModeByTeam, provisionalKickoffAt, replacementByAbsent, structuralLoanOverrideBySlot, teamAId, teamBId]);

  useEffect(() => {
    onSyncStateChange?.(Boolean(provisionalKickoffAt));
    return () => onSyncStateChange?.(false);
  }, [onSyncStateChange, provisionalKickoffAt]);

  useEffect(() => {
    if (!provisionalKickoffAt) return;
    setProvisionalNow(Date.now());
    const timer = window.setInterval(() => setProvisionalNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [provisionalKickoffAt]);

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
    if (structuralLoans.length !== structuralShortage) {
      setError(`O time de fora não possui jogadores disponíveis suficientes para completar ${targetPlayersPerTeam}x${targetPlayersPerTeam}.`);
      return;
    }

    // O match_order seria a quantidade de matches + 1
    const order = (round?.matches?.length || 0) + 1;
    const createInput = {
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
      structural_loan_overrides: structuralLoans.map((loan) => ({
        target_team_id: loan.targetTeamId,
        rotation_order: loan.rotationOrder,
        player_id: loan.playerId,
      })),
      structural_loan_excluded_player_ids: declinedStructuralPlayerIds,
    };
    const creationFingerprint = JSON.stringify(createInput);
    const existingIntent = creationIntentRef.current?.fingerprint === creationFingerprint
      ? creationIntentRef.current
      : null;
    const creationIntentKey = existingIntent?.key || crypto.randomUUID();
    const clientStartedAt = existingIntent?.startedAt || new Date().toISOString();
    creationIntentRef.current = {
      fingerprint: creationFingerprint,
      key: creationIntentKey,
      startedAt: clientStartedAt,
    };
    setProvisionalKickoffAt(clientStartedAt);
    setProvisionalNow(Date.now());
    setCreationUncertain(false);
    setLoading(true);
    setError("");
    const actionStartedAt = performance.now();
    window.requestAnimationFrame(() => {
      if (!navigator.sendBeacon) return;
      const payload = JSON.stringify({
        kind: "client_action",
        name: "create_match_feedback",
        value: Math.round(performance.now() - actionStartedAt),
        path: window.location.pathname,
        metadata: { provisional: true },
      });
      navigator.sendBeacon("/api/internal/observability", new Blob([payload], { type: "application/json" }));
    });

    let res: Awaited<ReturnType<typeof createMatch>> | null = null;
    try {
      res = await createMatch({
        idempotency_key: creationIntentKey,
        client_started_at: clientStartedAt,
        ...createInput,
      });
    } catch {
      // A resposta pode se perder depois de o banco criar a partida.
      // A próxima confirmação reutiliza a mesma chave enquanto a seleção não mudar.
    }

    if (navigator.sendBeacon) {
      const payload = JSON.stringify({
        kind: "client_action",
        name: "create_match",
        value: Math.round(performance.now() - actionStartedAt),
        path: window.location.pathname,
        metadata: { success: res?.success === true },
      });
      navigator.sendBeacon("/api/internal/observability", new Blob([payload], { type: "application/json" }));
    }

    if (!res?.success) {
      try {
        const existingId = await findLiveMatchForTeams(round.id, teamAId, teamBId);
        if (existingId) {
          if (draftStorageKey) window.sessionStorage.removeItem(draftStorageKey);
          setConfirmedMatchId(existingId);
          setLoading(false);
          router.replace(`/partidas/${existingId}`);
          return;
        }
      } catch {
        setCreationUncertain(true);
        setError("Conexão instável. Não sabemos se a partida foi criada. Verifique a rodada antes de tentar novamente.");
        setLoading(false);
        return;
      }
      if (!res || ("uncertain" in res && res.uncertain)) {
        setCreationUncertain(true);
        setError("O cronômetro está rodando neste aparelho, mas o servidor ainda não confirmou a partida.");
      } else {
        // O servidor respondeu com uma rejeição definitiva: uma nova tentativa
        // explícita pode representar uma nova intenção.
        creationIntentRef.current = null;
        setConfirmedMatchId(null);
        setProvisionalKickoffAt(null);
        setError(res.error || "Erro ao criar partida");
      }
      setLoading(false);
      return;
    }

    const confirmedId = res.matchId;
    if (!confirmedId) {
      setCreationUncertain(true);
      setError("O servidor confirmou a operação, mas não devolveu o identificador da partida.");
      setLoading(false);
      return;
    }
    creationIntentRef.current = null;
    if (draftStorageKey) window.sessionStorage.removeItem(draftStorageKey);
    setConfirmedMatchId(confirmedId);
    setLoading(false);
    router.replace(`/partidas/${confirmedId}`);
  }

  async function handleFixedGoalkeeperChange(teamId: string) {
    const previous = fixedGoalkeeperByTeam[teamId] || "";
    const nextPlayerId = previous ? "" : goalkeeperByTeam[teamId] || "";
    if (!previous && !nextPlayerId) {
      setError("Escolha um goleiro antes de fixá-lo.");
      return;
    }
    setFixedGoalkeeperByTeam((current) => ({ ...current, [teamId]: nextPlayerId }));
    setManagementLoading(true);
    setError("");
    const result = await setRoundTeamFixedGoalkeeper(round.id, teamId, nextPlayerId || null);
    if (!result.success) {
      setFixedGoalkeeperByTeam((current) => ({ ...current, [teamId]: previous }));
      setError(result.error || "Não foi possível atualizar o goleiro fixo.");
    } else {
      router.refresh();
    }
    setManagementLoading(false);
  }

  function renderGoalkeeperChoice(teamId: string, index: number) {
    const team = teams.find((item: any) => item.id === teamId);
    if (!team) return null;
    const suggested = bqGoalkeeperSuggestionByTeam[teamId];
    const fixedPlayerId = fixedGoalkeeperByTeam[teamId];
    const fixedEligible = (eligibleGoalkeepersByTeam[teamId] || []).some((player: any) => player.id === fixedPlayerId);
    const forced = forcedAbsenceGoalkeeperByTeam.has(teamId);
    const selectedId = goalkeeperByTeam[teamId] || "";
    const borrowedGoalkeeper = Boolean(selectedId && playerTeamById.get(selectedId) !== teamId);
    return (
      <div key={`goalkeeper-${teamId}`} className="rounded-2xl border border-accent/25 bg-accent/[.055] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[10px] font-black uppercase tracking-wide text-foreground">
            <TeamReferenceBadge position={team.position} fallbackIndex={index} color={team.color} className="h-7 w-7 text-sm" />
            <span className="truncate">Goleiro · {team.name}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleFixedGoalkeeperChange(teamId)}
            disabled={managementLoading || forced || (!fixedPlayerId && (!selectedId || borrowedGoalkeeper))}
            aria-pressed={Boolean(fixedPlayerId)}
            aria-label={fixedPlayerId ? `Desfixar goleiro do ${team.name}` : `Fixar goleiro do ${team.name} para esta rodada`}
            title={fixedPlayerId ? "Toque para voltar ao rodízio" : "Manter este goleiro nas próximas partidas da rodada"}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition-colors disabled:opacity-40 ${fixedPlayerId ? "border-cyan-300/60 bg-cyan-300/20 text-cyan-100" : "border-border bg-background text-muted"}`}
          >
            🧤 {fixedPlayerId ? "Fixo" : "Fixar"}
          </button>
        </div>
        <select
          value={fixedEligible && !forced ? fixedPlayerId : goalkeeperModeByTeam[teamId] === "bq" && suggested ? "__bq_rotation__" : selectedId}
          onChange={(event) => {
            const useRotation = event.target.value === "__bq_rotation__";
            setGoalkeeperByTeam((current) => ({ ...current, [teamId]: useRotation ? suggested?.id || "" : event.target.value }));
            setGoalkeeperModeByTeam((current) => ({ ...current, [teamId]: useRotation ? "bq" : "manual" }));
          }}
          disabled={forced || fixedEligible}
          aria-label={`Escolher goleiro do ${team.name}`}
          className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold text-foreground outline-none focus:border-accent disabled:opacity-75"
        >
          {suggested && !fixedEligible && (
            <option value="__bq_rotation__">{forced ? "Substituto" : "Rodízio"} · {suggested.name}</option>
          )}
          {!suggested && !selectedId && <option value="">Escolha o goleiro</option>}
          {[...(eligibleGoalkeepersByTeam[teamId] || [])]
            .sort((a: any, b: any) => a.goalkeeperOrder - b.goalkeeperOrder || a.name.localeCompare(b.name, "pt-BR"))
            .map((player: any) => <option key={player.id} value={player.id}>{player.id === fixedPlayerId ? "🧤 " : ""}{player.name}</option>)}
        </select>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          {forced ? `Substituto no gol por ausência do titular. ${replacementsDoNotScore ? "Não recebe pontos nem scouts nesta partida." : "Recebe pontos e scouts normalmente."}` : borrowedGoalkeeper && !fixedPlayerId
            ? "Jogador emprestado não pode ser fixado neste time."
            : fixedPlayerId && !fixedEligible
            ? "Goleiro fixo indisponível; escolha válida da fila aplicada nesta partida."
            : fixedEligible ? "Luva ativa: este jogador permanece no gol nas próximas partidas desta rodada. Desfixe para trocar."
            : "A fila sugere o próximo goleiro. Toque na luva para manter o escolhido nesta rodada."}
        </p>
      </div>
    );
  }

  if (provisionalKickoffAt) {
    const elapsedSeconds = Math.max(0, Math.floor(
      (provisionalNow - new Date(provisionalKickoffAt).getTime()) / 1000,
    ));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const teamA = teams.find((team: any) => team.id === teamAId);
    const teamB = teams.find((team: any) => team.id === teamBId);

    return (
      <section className="space-y-4" role="status" aria-live="polite">
        <div className="overflow-hidden rounded-3xl border border-accent/35 bg-[#06130b] shadow-[0_0_32px_rgba(190,255,0,0.08)]">
          <div className="border-b border-accent/20 bg-accent/[.07] px-5 py-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">
              {confirmedMatchId ? "Partida confirmada" : creationUncertain ? "Sem confirmação" : "Sincronizando partida"}
            </p>
            <p className="mt-2 font-athletic text-5xl font-black tabular-nums text-foreground">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </p>
            <p className="mt-2 text-[10px] font-bold text-muted">Cronômetro iniciado neste aparelho</p>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5 text-center">
            <div className="min-w-0">
              <TeamReferenceBadge position={teamA?.position} fallbackIndex={0} color={teamA?.color} className="mx-auto h-14 w-14 text-3xl" />
              <p className="mt-2 truncate text-xs font-black text-foreground">{teamA?.name}</p>
            </div>
            <Swords className="h-6 w-6 text-accent" />
            <div className="min-w-0">
              <TeamReferenceBadge position={teamB?.position} fallbackIndex={1} color={teamB?.color} className="mx-auto h-14 w-14 text-3xl" />
              <p className="mt-2 truncate text-xs font-black text-foreground">{teamB?.name}</p>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 text-center ${creationUncertain ? "border-warning/45 bg-warning/10" : "border-accent/25 bg-accent/[.05]"}`}>
          <p className={`text-xs font-black ${creationUncertain ? "text-warning" : "text-accent"}`}>
            {confirmedMatchId ? "Tudo certo. Abrindo o placar ao vivo…" : creationUncertain ? "A conexão não confirmou o primeiro apito." : "Confirmando escalações e disponibilidade…"}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            {confirmedMatchId ? "Se a navegação não acontecer automaticamente, abra o placar pelo botão abaixo." : "Gols, substituições e outros controles serão liberados assim que o servidor confirmar a partida."}
          </p>
        </div>

        {creationUncertain && (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-sm font-black text-background disabled:opacity-50"
          >
            {loading ? "Confirmando…" : "Tentar confirmar novamente"}
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        {confirmedMatchId && (
          <button
            type="button"
            onClick={() => router.replace(`/partidas/${confirmedMatchId}`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-sm font-black text-background"
          >
            Abrir placar ao vivo
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {substitutionNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sorteio de substituição">
          <div className="w-full max-w-sm rounded-3xl border border-warning/35 bg-[#07150d] p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/15 text-warning"><ArrowLeftRight className="h-5 w-5" /></span>
              <div>
                <h2 className="text-base font-black text-foreground">Substituição sorteada</h2>
                <p className="text-[10px] font-semibold text-muted">
                  Quem foi menos sorteado teve prioridade. O substituto entra no gol e {replacementsDoNotScore ? "não pontua nesta partida." : "pontua normalmente nesta partida."}
                </p>
              </div>
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
      {!quickStart && !embedded && <div className="flex items-center gap-3">
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
      </div>}

      {!quickStart ? <div className="glass-card p-6 flex flex-col items-center gap-6 animate-fade-in-up">
        
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
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {teams.map((t: any, index: number) => {
              const isSelected = teamAId === t.id;
              const isDisabled = teamBId === t.id || (!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id));
              const vestColor = colorByTeam[t.id] || t.color || "#CCFF00";
              const captainName = (t.team_players || []).find((entry: any) => entry.player_id === captainByTeam[t.id])?.players?.name || "Sem capitão";

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
                    min-w-0 overflow-hidden p-2 sm:p-3 rounded-2xl border flex flex-col items-center gap-1.5 sm:gap-2 transition-all duration-200
                    ${isSelected ? "scale-[1.03] ring-1 ring-white/20" : "hover:border-white/30 hover:bg-surface-hover"}
                    ${teamBId === t.id ? "opacity-40 cursor-not-allowed" : ""}
                    ${!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id) ? "opacity-35 cursor-not-allowed" : ""}
                  `}
                  disabled={isDisabled}
                >
                  <TeamReferenceBadge position={t.position} fallbackIndex={index} color={vestColor} className="h-11 w-11 text-2xl sm:h-14 sm:w-14 sm:text-3xl" />
                  <TeamCrest name={t.name} crestUrl={t.crest_url} color={vestColor} className="h-8 w-8 sm:h-11 sm:w-11" />
                  <span className="w-full truncate text-center text-[10px] font-bold text-muted">{t.name}</span>
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
                  <span className="flex min-h-11 w-full min-w-0 flex-col items-center overflow-hidden px-1 text-[7px] font-black uppercase text-accent sm:text-[8px]">
                    <Crown className="mb-0.5 h-2.5 w-2.5 shrink-0" />
                    <span className="line-clamp-3 w-full whitespace-normal break-normal text-center leading-[1.1] [overflow-wrap:normal] [word-break:normal]" title={captainName}>{captainName}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {teamAId && renderGoalkeeperChoice(teamAId, 0)}
        </div>

        <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center ring-4 ring-background z-10 -my-3">
          <Swords className="w-5 h-5 text-muted" />
        </div>

        {/* Team B */}
        <div className="w-full space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider pl-1">
            Time 2
          </label>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {teams.map((t: any, index: number) => {
              const isSelected = teamBId === t.id;
              const isDisabled = teamAId === t.id || (!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id));
              const vestColor = colorByTeam[t.id] || t.color || "#CCFF00";
              const captainName = (t.team_players || []).find((entry: any) => entry.player_id === captainByTeam[t.id])?.players?.name || "Sem capitão";

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
                    min-w-0 overflow-hidden p-2 sm:p-3 rounded-2xl border flex flex-col items-center gap-1.5 sm:gap-2 transition-all duration-200
                    ${isSelected ? "scale-[1.03] ring-1 ring-white/20" : "hover:border-white/30 hover:bg-surface-hover"}
                    ${teamAId === t.id ? "opacity-40 cursor-not-allowed" : ""}
                    ${!previousMatch && usesArrivalOrder && !firstMatchAllowedIds.has(t.id) ? "opacity-35 cursor-not-allowed" : ""}
                  `}
                  disabled={isDisabled}
                >
                  <TeamReferenceBadge position={t.position} fallbackIndex={index} color={vestColor} className="h-11 w-11 text-2xl sm:h-14 sm:w-14 sm:text-3xl" />
                  <TeamCrest name={t.name} crestUrl={t.crest_url} color={vestColor} className="h-8 w-8 sm:h-11 sm:w-11" />
                  <span className="w-full truncate text-center text-[10px] font-bold text-muted">{t.name}</span>
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
                  <span className="flex min-h-11 w-full min-w-0 flex-col items-center overflow-hidden px-1 text-[7px] font-black uppercase text-accent sm:text-[8px]">
                    <Crown className="mb-0.5 h-2.5 w-2.5 shrink-0" />
                    <span className="line-clamp-3 w-full whitespace-normal break-normal text-center leading-[1.1] [overflow-wrap:normal] [word-break:normal]" title={captainName}>{captainName}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {teamBId && renderGoalkeeperChoice(teamBId, 1)}
        </div>

      </div> : (
        <div className="space-y-3">
          {error && <div className="rounded-xl bg-danger/10 p-3 text-center text-xs font-semibold text-danger">{error}</div>}
          <section className="rounded-2xl border border-accent/25 bg-accent/[.06] p-4">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-accent">Próximo confronto sugerido</p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {[teamAId, teamBId].map((teamId, index) => {
                const team = teams.find((item: any) => item.id === teamId);
                return index === 1 ? (
                  <div key={teamId} className="contents">
                    <Swords className="h-5 w-5 text-muted" />
                    <div className="min-w-0 text-center">
                      <TeamReferenceBadge position={team?.position} fallbackIndex={index} color={team?.color} className="mx-auto h-14 w-14 text-3xl" />
                      <TeamCrest name={team?.name || "Time"} crestUrl={team?.crest_url} color={team?.color} className="mx-auto h-12 w-12" />
                      <p className="mt-2 truncate text-[10px] font-bold text-muted">{team?.name}</p>
                    </div>
                  </div>
                ) : (
                  <div key={teamId} className="min-w-0 text-center">
                    <TeamReferenceBadge position={team?.position} fallbackIndex={index} color={team?.color} className="mx-auto h-14 w-14 text-3xl" />
                    <TeamCrest name={team?.name || "Time"} crestUrl={team?.crest_url} color={team?.color} className="mx-auto h-12 w-12" />
                    <p className="mt-2 truncate text-[10px] font-bold text-muted">{team?.name}</p>
                  </div>
                );
              })}
            </div>
          </section>
          {selectedTeamIds.length === 2 && <div className="grid gap-3 sm:grid-cols-2">
            {renderGoalkeeperChoice(teamAId, 0)}
            {renderGoalkeeperChoice(teamBId, 1)}
          </div>}
        </div>
      )}

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
                  Não há jogadores presentes e disponíveis fora deste confronto.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {selectedTeamIds.length === 2 && structuralShortage > 0 && (
        <section className="overflow-hidden rounded-2xl border border-accent/30 bg-accent/5 animate-fade-in-up">
          <div className="border-b border-accent/20 px-4 py-3">
            <h2 className="text-sm font-black text-foreground">Empréstimos automáticos</h2>
            <p className="mt-1 text-[10px] text-muted">Fila fixa para completar {targetPlayersPerTeam}x{targetPlayersPerTeam} sem repetir antes da vez.</p>
          </div>
          <div className="space-y-2 p-4">
            {structuralLoans.map((loan) => {
              const player = teamPlayerById.get(loan.playerId) as any;
              const source = teams.find((team: any) => team.id === loan.originalTeamId);
              const target = teams.find((team: any) => team.id === loan.targetTeamId);
              const sourceEntry = source?.team_players?.find((entry: any) => entry.player_id === loan.playerId);
              const slotKey = `${loan.targetTeamId}:${loan.rotationOrder}`;
              const usedByAnotherSlot = new Set(structuralLoans.filter((item) => `${item.targetTeamId}:${item.rotationOrder}` !== slotKey).map((item) => item.playerId));
              const replacementIds = new Set(Object.values(replacementByAbsent).filter(Boolean));
              const candidates = (source?.team_players || []).filter((entry: any) =>
                availability.get(entry.player_id) === "available"
                && !usedByAnotherSlot.has(entry.player_id)
                && !replacementIds.has(entry.player_id)
              );
              return <div key={slotKey} className="rounded-xl bg-background/60 px-3 py-2.5 text-xs font-bold text-foreground">
                <p><span className="text-accent">E{sourceEntry?.loan_order || "—"}</span> · {player?.name || "Jogador"} · {source?.name} → {target?.name}</p>
                <label className="mt-2 block">
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-muted">Trocar se não quiser jogar</span>
                  <select
                    value={loan.playerId}
                    onChange={(event) => {
                      const nextPlayerId = event.target.value;
                      setDeclinedStructuralPlayerIds((current) => [...new Set([...current.filter((id) => id !== nextPlayerId), loan.playerId])]);
                      setStructuralLoanOverrideBySlot((current) => ({ ...current, [slotKey]: nextPlayerId }));
                    }}
                    className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-accent"
                  >
                    {candidates.map((entry: any) => <option key={entry.player_id} value={entry.player_id}>{entry.players?.name || "Jogador"} · E{entry.loan_order || "—"}</option>)}
                  </select>
                </label>
              </div>;
            })}
            {structuralLoans.length !== structuralShortage && <p className="rounded-xl bg-danger/10 p-3 text-xs font-semibold text-danger">Não há jogadores disponíveis suficientes no time de fora.</p>}
          </div>
        </section>
      )}

      <button
        onClick={handleStart}
        disabled={loading || !teamAId || !teamBId || !goalkeeperByTeam[teamAId] || !goalkeeperByTeam[teamBId]}
        className="w-full bg-accent hover:bg-accent-light text-background font-bold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
      >
        {loading ? "Criando..." : creationUncertain ? "Tentar confirmar novamente" : quickStart ? "Iniciar próxima partida" : "Apita o Árbitro!"}
        <ChevronRight className="w-5 h-5" />
      </button>

      {creationUncertain && (
        <Link href={`/rodadas/${round.id}`} className="block w-full rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-center text-xs font-black text-warning">
          Verificar partida na rodada
        </Link>
      )}

      {(quickStart || embedded) && onCancel && (
        <button type="button" onClick={onCancel} disabled={loading} className="w-full rounded-xl border border-border bg-surface py-3 text-xs font-black text-muted disabled:opacity-50">
          {quickStart ? "Agora não · voltar para a rodada" : "Cancelar"}
        </button>
      )}

    </div>
  );
}
