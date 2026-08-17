"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRoundWithTeams, saveRoundPrelist, type TeamInput } from "@/lib/actions/rounds";
import type { Player, RoundType, Stadium, TeamFormationMode } from "@/lib/types";
import { drawTeamsByAttendance, drawTeamsDirect } from "@/lib/round-draw";
import {
  Users,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PencilLine,
  RotateCcw,
  Search,
  Sparkles,
  Stadium as StadiumIcon,
  X,
} from "@/components/icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";
import { TeamCrest } from "./TeamCrest";
import {
  MAX_PLAYERS_PER_TEAM,
  MAX_TEAMS_PER_ROUND,
  MIN_TEAMS_PER_ROUND,
} from "@/lib/constants";
import { TEAM_PRESETS } from "@/lib/teamPresets";
import { supabase } from "@/lib/supabase";
import { DeleteRoundButton } from "./DeleteRoundButton";
import { useDialogViewport } from "@/lib/useDialogViewport";

type DrawPlayer = Player & {
  points?: number;
  rounds?: number;
  games?: number;
};

type DrawTeam = {
  id: string;
  name: string;
  color: string;
  crestUrl: string | null;
  players: DrawPlayer[];
};

export const VEST_COLORS = [
  { label: "Verde Limão", color: "#22c55e", bg: "bg-emerald-500", text: "text-emerald-400" },
  { label: "Laranja", color: "#f97316", bg: "bg-orange-500", text: "text-orange-400" },
  { label: "Azul Royal", color: "#3b82f6", bg: "bg-blue-500", text: "text-blue-400" },
  { label: "Vermelho", color: "#ef4444", bg: "bg-red-500", text: "text-red-400" },
  { label: "Amarelo", color: "#eab308", bg: "bg-yellow-400", text: "text-yellow-300" },
  { label: "Preto", color: "#1e293b", bg: "bg-slate-800", text: "text-slate-200" },
  { label: "Branco", color: "#f8fafc", bg: "bg-slate-100", text: "text-slate-800" },
  { label: "Rosa", color: "#ec4899", bg: "bg-pink-500", text: "text-pink-400" },
];

function createDefaultTeams(count: number, offset = 0): DrawTeam[] {
  const featuredTeams = TEAM_PRESETS.slice(0, 4);
  const normalizedOffset = ((offset % featuredTeams.length) + featuredTeams.length) % featuredTeams.length;
  const rotatedFeatured = [...featuredTeams.slice(normalizedOffset), ...featuredTeams.slice(0, normalizedOffset)];
  const availableTeams = [...rotatedFeatured, ...TEAM_PRESETS.slice(4)];
  return availableTeams.slice(0, count).map((team, index): DrawTeam => ({
    id: `team${index + 1}`,
    ...team,
    players: [] as DrawPlayer[],
  }));
}

export function RoundCreator({
  allPlayers,
  stadiums = [],
  initialDate,
  initialPlayerIds = [],
  roundType = "official",
  callupId = null,
  prelistRoundId = null,
  initialTime = "08:00",
  initialStadiumId = null,
  availableCallup = null,
  mountTeams = false,
  prelistNumber = null,
  playersPerTeam = 5,
  teamsPerRound = 3,
  teamPresetOffsets = {},
}: {
  allPlayers: DrawPlayer[];
  stadiums?: Stadium[];
  initialDate?: string;
  initialPlayerIds?: string[];
  roundType?: RoundType;
  callupId?: string | null;
  prelistRoundId?: string | null;
  initialTime?: string;
  initialStadiumId?: string | null;
  availableCallup?: { id: string; date: string; roundType: RoundType; playerIds: string[] } | null;
  mountTeams?: boolean;
  prelistNumber?: number | null;
  playersPerTeam?: number;
  teamsPerRound?: number;
  teamPresetOffsets?: Partial<Record<RoundType, number>>;
}) {
  const router = useRouter();
  const [refreshingPlayers, startPlayersRefresh] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3>(prelistRoundId ? (mountTeams ? 3 : 2) : 1);
  const [date, setDate] = useState(() => initialDate || new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(initialTime.slice(0, 5));
  const [selectedStadiumId, setSelectedStadiumId] = useState<string | null>(initialStadiumId || stadiums[0]?.id || null);
  const [selectedRoundType, setSelectedRoundType] = useState<RoundType>(roundType);
  const [sourceCallupId, setSourceCallupId] = useState<string | null>(callupId);
  const [currentPrelistId, setCurrentPrelistId] = useState<string | null>(prelistRoundId);
  const [playerSearch, setPlayerSearch] = useState("");
  
  // Step 2: Seleção
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set(initialPlayerIds));
  
  // Step 3: Times
  const teamCount = Math.min(MAX_TEAMS_PER_ROUND, Math.max(MIN_TEAMS_PER_ROUND, Math.trunc(teamsPerRound)));
  const [teams, setTeams] = useState<DrawTeam[]>(() => createDefaultTeams(teamCount, teamPresetOffsets[roundType] || 0));
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [openVestPickerTeamId, setOpenVestPickerTeamId] = useState<string | null>(null);
  const [formationMode, setFormationMode] = useState<TeamFormationMode>("manual");
  const [attendanceOrder, setAttendanceOrder] = useState<string[]>([]);
  const [pendingDrawMode, setPendingDrawMode] = useState<Exclude<TeamFormationMode, "manual"> | null>(null);
  useDialogViewport(Boolean(pendingDrawMode));
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const teamCapacity = Math.min(MAX_PLAYERS_PER_TEAM, Math.max(1, Math.trunc(playersPerTeam)));
  const roundCapacity = teamCapacity * teamCount;

  function selectRoundType(type: RoundType) {
    if (sourceCallupId) return;
    setSelectedRoundType(type);
    setTeams(createDefaultTeams(teamCount, teamPresetOffsets[type] || 0));
  }

  const selectedPlayers = allPlayers.filter(p => selectedPlayerIds.has(p.id));
  const visiblePlayers = useMemo(() => {
    const query = playerSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return allPlayers;
    return allPlayers.filter((player) => `${player.name} ${player.nickname || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [allPlayers, playerSearch]);

  useEffect(() => {
    if (!sourceCallupId) return;
    const synchronizedIds = new Set(initialPlayerIds);
    setSelectedPlayerIds(synchronizedIds);
    setTeams((current) => current.map((team) => ({
      ...team,
      players: team.players.filter((player) => synchronizedIds.has(player.id)),
    })));
    setAttendanceOrder((current) => current.filter((playerId) => synchronizedIds.has(playerId)));
  }, [initialPlayerIds, sourceCallupId]);

  useEffect(() => {
    if (step !== 2 && !(sourceCallupId && step === 3)) return;
    const refresh = () => {
      if (document.visibilityState === "visible") startPlayersRefresh(() => router.refresh());
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [router, sourceCallupId, step]);

  useEffect(() => {
    if (!sourceCallupId) return;
    const channel = supabase
      .channel(`prelist-callup-${sourceCallupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "callup_entries" }, () => {
        startPlayersRefresh(() => router.refresh());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, sourceCallupId]);

  useEffect(() => {
    if (step !== 2 && step !== 3) return;
    const channel = supabase
      .channel("round-creator-players")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        startPlayersRefresh(() => router.refresh());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, step]);
  
  // Jogadores que estão selecionados para a pelada, mas ainda não foram alocados em nenhum time
  const unassignedPlayers = selectedPlayers.filter(
    p => !teams.some(t => t.players.some(tp => tp.id === p.id))
  );

  function togglePlayerSelection(id: string) {
    const next = new Set(selectedPlayerIds);
    if (next.has(id)) {
      next.delete(id);
      setTeams((current) => current.map((team) => ({
        ...team,
        players: team.players.filter((player) => player.id !== id),
      })));
    }
    else {
      if (next.size >= roundCapacity) {
        setError(`A rodada aceita no máximo ${roundCapacity} jogadores: ${teamCapacity} por time.`);
        return;
      }
      next.add(id);
    }
    setError("");
    setSelectedPlayerIds(next);
    if (!next.has(id)) setAttendanceOrder((current) => current.filter((playerId) => playerId !== id));
  }

  function chooseManualSource() {
    if (currentPrelistId) return;
    setSourceCallupId(null);
    setSelectedPlayerIds(new Set());
  }

  function chooseCallupSource() {
    if (!availableCallup || currentPrelistId) return;
    setSourceCallupId(availableCallup.id);
    setDate(availableCallup.date);
    setSelectedRoundType(availableCallup.roundType);
    setSelectedPlayerIds(new Set(availableCallup.playerIds));
    setTeams(createDefaultTeams(teamCount, teamPresetOffsets[availableCallup.roundType] || 0));
  }

  async function persistPrelist(destination: "list" | "teams") {
    if (destination === "teams" && selectedPlayerIds.size === 0) {
      setError("Adicione jogadores antes de montar os times. A pré-lista vazia pode ser salva para abrir o Cartola.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await saveRoundPrelist({
      roundId: currentPrelistId,
      date,
      startTime,
      roundType: selectedRoundType,
      playerIds: [...selectedPlayerIds],
      callupId: sourceCallupId,
      stadiumId: selectedStadiumId,
    });
    if (!result.success || !result.roundId) {
      setError(result.error || "Nao foi possivel salvar a pre-lista.");
      setLoading(false);
      return;
    }
    setCurrentPrelistId(result.roundId);
    if (destination === "teams") {
      router.replace(`/admin/rodada?round=${result.roundId}&mount=1`);
      setStep(3);
    } else {
      router.push("/admin/prelistas");
    }
    setLoading(false);
  }

  function assignToTeam(player: DrawPlayer, teamId: string) {
    setFormationMode("manual");
    setAttendanceOrder([]);
    const targetTeam = teams.find((team) => team.id === teamId);
    const alreadyInTarget = targetTeam?.players.some((item) => item.id === player.id);
    if (!targetTeam || (!alreadyInTarget && targetTeam.players.length >= teamCapacity)) {
      setError(`Esse time já atingiu o limite de ${teamCapacity} jogadores.`);
      return;
    }
    setError("");
    setTeams(prev => prev.map(t => {
      // Remove de outros times se estiver
      const filtered = t.players.filter(p => p.id !== player.id);
      // Adiciona no time alvo
      if (t.id === teamId) {
        return { ...t, players: [...filtered, player] };
      }
      return { ...t, players: filtered };
    }));
  }

  function removeFromTeam(player: DrawPlayer) {
    setFormationMode("manual");
    setAttendanceOrder([]);
    setTeams(prev => prev.map(t => ({
      ...t,
      players: t.players.filter(p => p.id !== player.id)
    })));
  }

  function executeDirectDraw(mode: Exclude<TeamFormationMode, "manual">) {
    if (selectedPlayers.length === 0) {
      setError("Selecione os jogadores antes de sortear os times.");
      return;
    }
    try {
      const result = drawTeamsDirect({
        players: selectedPlayers,
        teamCount,
        playersPerTeam: teamCapacity,
        mode,
      });
      const playerById = new Map(selectedPlayers.map((player) => [player.id, player]));
      setTeams((current) => current.map((team, index) => ({
        ...team,
        players: (result[index] || []).map((id) => playerById.get(id)!).filter(Boolean),
      })));
      setFormationMode(mode);
      setPendingDrawMode(null);
      setError("");
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "Não foi possível sortear os times.");
    }
  }

  function requestDraw(mode: Exclude<TeamFormationMode, "manual">) {
    if (selectedPlayers.length < 2) {
      setError("Selecione pelo menos 2 jogadores para sortear.");
      return;
    }
    setError("");
    setPendingDrawMode(mode);
  }

  function toggleAttendance(playerId: string) {
    setAttendanceOrder((current) => current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId]);
  }

  function markAllAttendance() {
    setAttendanceOrder(selectedPlayers.map((p) => p.id));
  }

  function clearAttendance() {
    setAttendanceOrder([]);
  }

  function confirmAttendanceDraw() {
    if (!pendingDrawMode) return;
    if (attendanceOrder.length === 0) {
      executeDirectDraw(pendingDrawMode);
      return;
    }
    try {
      const minimumPresent = Math.min(selectedPlayers.length, teamCapacity * 2);
      if (attendanceOrder.length < minimumPresent) {
        // Se marcou apenas alguns, completa com os outros selecionados
        const remaining = selectedPlayers.filter((p) => !attendanceOrder.includes(p.id)).map((p) => p.id);
        const fullOrder = [...attendanceOrder, ...remaining];
        const result = drawTeamsByAttendance({
          players: selectedPlayers,
          attendanceOrder: fullOrder,
          teamCount,
          playersPerTeam: teamCapacity,
          mode: pendingDrawMode,
        });
        const playerById = new Map(selectedPlayers.map((player) => [player.id, player]));
        setTeams((current) => current.map((team, index) => ({
          ...team,
          players: (result.teams[index] || []).map((id) => playerById.get(id)!).filter(Boolean),
        })));
      } else {
        const result = drawTeamsByAttendance({
          players: selectedPlayers,
          attendanceOrder,
          teamCount,
          playersPerTeam: teamCapacity,
          mode: pendingDrawMode,
        });
        const playerById = new Map(selectedPlayers.map((player) => [player.id, player]));
        setTeams((current) => current.map((team, index) => ({
          ...team,
          players: (result.teams[index] || []).map((id) => playerById.get(id)!).filter(Boolean),
        })));
      }
      setFormationMode(pendingDrawMode);
      setPendingDrawMode(null);
      setError("");
    } catch (drawError) {
      // Fallback para sorteio direto
      executeDirectDraw(pendingDrawMode);
    }
  }

  function updateTeamName(teamId: string, name: string) {
    setTeams((current) => current.map((team) => (
      team.id === teamId ? { ...team, name } : team
    )));
    setError("");
  }

  function updateTeamColor(teamId: string, color: string) {
    setTeams((current) => current.map((team) => (
      team.id === teamId ? { ...team, color } : team
    )));
  }

  async function handleSave() {
    const normalizedNames = teams.map((team) => team.name.trim());
    if (normalizedNames.some((name) => !name)) {
      setError("Todos os times precisam ter um nome.");
      return;
    }
    if (new Set(normalizedNames.map((name) => name.toLocaleLowerCase("pt-BR"))).size !== normalizedNames.length) {
      setError("Use um nome diferente para cada time.");
      return;
    }

    if (teams.some((team) => team.players.length > teamCapacity)) {
      setError(`Cada time pode ter no máximo ${teamCapacity} jogadores.`);
      return;
    }

    await handleCreateRound();
  }

  async function handleCreateRound() {
    setLoading(true);
    setError("");

    const teamsInput: TeamInput[] = teams.map(t => ({
      name: t.name.trim(),
      color: t.color,
      crestUrl: t.crestUrl,
      playerIds: t.players.map(p => p.id)
    }));

    // Converte a data local para um formato adequado ou salva como YYYY-MM-DD
    const res = await createRoundWithTeams(date, teamsInput, {
      roundType: selectedRoundType,
      callupId: sourceCallupId,
      formationMode,
      attendanceOrder: formationMode === "manual" ? [] : attendanceOrder,
      prelistRoundId: currentPrelistId,
      startTime,
      stadiumId: selectedStadiumId,
    });
    
    if (!res.success) {
      setError(res.error || "Erro ao salvar rodada");
      setLoading(false);
      return;
    }

    router.push(`/rodadas/${res.roundId}`);
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-3 text-xs font-bold ${selectedRoundType === "friendly" ? "border-warning/30 bg-warning/10 text-warning" : "border-accent/25 bg-accent/10 text-accent"}`}>
        {selectedRoundType === "friendly" ? "Amistoso: estatísticas separadas do Ranking oficial" : "Rodada oficial · Ranked"}
        {currentPrelistId && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-black text-warning">PRE-LISTA SALVA</span>}
        {sourceCallupId && <span className="ml-1 text-muted">· sincronizada com a convocação</span>}
      </div>
      {/* Progresso */}
      <div className="flex items-center justify-between px-2">
        <div className={`flex flex-col items-center gap-1 ${step >= 1 ? "text-accent" : "text-muted"}`}>
          <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">1</div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Data</span>
        </div>
        <div className={`flex-1 h-px ${step >= 2 ? "bg-accent" : "bg-border"} mx-2`} />
        <div className={`flex flex-col items-center gap-1 ${step >= 2 ? "text-accent" : "text-muted"}`}>
          <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">2</div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Jogadores</span>
        </div>
        <div className={`flex-1 h-px ${step >= 3 ? "bg-accent" : "bg-border"} mx-2`} />
        <div className={`flex flex-col items-center gap-1 ${step >= 3 ? "text-accent" : "text-muted"}`}>
          <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">3</div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Times</span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold">
          {error}
        </div>
      )}

      {/* STEP 1: Data */}
      {step === 1 && (
        <div className="glass-card min-w-0 overflow-hidden p-5 space-y-4 animate-fade-in">
          {availableCallup && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-black uppercase tracking-wider text-muted">Origem da lista</legend>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={chooseManualSource} className={`rounded-xl border px-3 py-3 text-xs font-black ${!sourceCallupId ? "border-accent bg-accent text-background" : "border-border bg-background text-muted"}`}>Selecao manual</button>
                <button type="button" onClick={chooseCallupSource} className={`rounded-xl border px-3 py-3 text-xs font-black ${sourceCallupId ? "border-accent bg-accent text-background" : "border-border bg-background text-muted"}`}>Puxar convocacao</button>
              </div>
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <legend className="text-xs font-black uppercase tracking-wider text-muted">Tipo de pelada</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={Boolean(sourceCallupId)} onClick={() => selectRoundType("official")} className={`rounded-xl border px-3 py-3 text-xs font-black transition-colors ${selectedRoundType === "official" ? "border-accent bg-accent text-background" : "border-border bg-background text-muted"}`}>Ranked</button>
              <button type="button" disabled={Boolean(sourceCallupId)} onClick={() => selectRoundType("friendly")} className={`rounded-xl border px-3 py-3 text-xs font-black transition-colors ${selectedRoundType === "friendly" ? "border-warning bg-warning text-background" : "border-border bg-background text-muted"}`}>Amistoso</button>
            </div>
            {sourceCallupId && <p className="text-[10px] text-muted">O tipo e a data foram definidos pela convocação.</p>}
          </fieldset>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            Quando será a pelada?
          </h2>
          <div className="grid min-w-0 w-full">
            <input
              type="date"
              value={date}
              disabled={Boolean(sourceCallupId)}
              onChange={e => setDate(e.target.value)}
              className="block min-w-0 max-w-full w-full appearance-none bg-surface-hover border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="round-start-time" className="text-xs font-black uppercase tracking-wider text-muted">Horario de inicio</label>
            <input
              id="round-start-time"
              type="time"
              value={startTime}
              required
              onChange={(event) => setStartTime(event.target.value)}
              className="block min-w-0 max-w-full w-full appearance-none bg-surface-hover border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="round-stadium-select" className="text-xs font-black uppercase tracking-wider text-muted flex items-center gap-1.5">
              <StadiumIcon className="w-3.5 h-3.5 text-accent" />
              Campo / Estádio
            </label>
            <select
              id="round-stadium-select"
              value={selectedStadiumId || ""}
              onChange={(e) => setSelectedStadiumId(e.target.value || null)}
              className="block min-w-0 max-w-full w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
            >
              {stadiums.length > 0 ? (
                stadiums.map((stadium) => (
                  <option key={stadium.id} value={stadium.id}>
                    {stadium.name} {stadium.address ? `(${stadium.address})` : ""}
                  </option>
                ))
              ) : (
                <option value="">Estádio Padrão da Liga</option>
              )}
            </select>
          </div>
          <button
            onClick={() => setStep(2)}
            className="w-full bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
          >
            Próximo <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 2: Seleção de Jogadores */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          {currentPrelistId && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-warning">Pre-lista</p><p className="text-xs text-muted">Participantes salvos. Edite e salve novamente quando precisar.</p></div>
                <div className="flex items-center gap-2"><span className="rounded-full bg-warning/15 px-2.5 py-1 text-[9px] font-black text-warning">RASCUNHO</span>{prelistNumber && <DeleteRoundButton redirectTo="/rodadas" round={{ id: currentPrelistId, number: prelistNumber, round_type: selectedRoundType, date, playersCount: selectedPlayerIds.size, matchesCount: 0 }} />}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={date} disabled={Boolean(sourceCallupId)} onChange={(event) => setDate(event.target.value)} className="min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground disabled:opacity-60" />
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground" />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              Quem vai jogar?
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => startPlayersRefresh(() => router.refresh())}
                disabled={refreshingPlayers}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px] font-black uppercase text-muted disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${refreshingPlayers ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <span className="rounded-lg bg-surface-hover px-2 py-1 text-xs font-bold text-muted">
                {selectedPlayerIds.size}/{roundCapacity}
              </span>
            </div>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={playerSearch}
              onChange={(event) => setPlayerSearch(event.target.value)}
              placeholder="Buscar jogador pelo nome"
              className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>

          {sourceCallupId && (
            <div className="rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-[10px] font-semibold leading-4 text-muted">
              Lista sincronizada com a Convocação. Para adicionar ou remover alguém, altere a convocação; esta tela será atualizada automaticamente.
            </div>
          )}

          <div className="glass-card overflow-hidden max-h-[50vh] overflow-y-auto no-scrollbar">
            {visiblePlayers.map((player, idx) => {
              const isSelected = selectedPlayerIds.has(player.id);
              return (
                <div
                  key={player.id}
                  onClick={() => { if (!sourceCallupId) togglePlayerSelection(player.id); }}
                  className={`
                    flex items-center justify-between p-3 transition-colors ${sourceCallupId ? "cursor-default" : "cursor-pointer"}
                    ${idx < visiblePlayers.length - 1 ? "border-b border-border" : ""}
                    ${isSelected ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-surface-hover"}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar
                      name={player.name}
                      avatarUrl={player.avatar_url}
                      className={`w-10 h-10 rounded-full text-xs font-bold transition-colors flex-shrink-0 ${
                        isSelected
                          ? "bg-accent text-background ring-2 ring-accent"
                          : "bg-surface text-muted border border-border"
                      }`}
                    />
                    <div>
                      <p className={`text-sm font-bold ${isSelected ? "text-accent" : "text-foreground"}`}>
                        {player.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />
                        <span className="text-[9px] text-muted">{player.points || 0} pts</span>
                      </div>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-accent" />}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => currentPrelistId ? router.push("/admin/prelistas") : setStep(1)}
              className="flex-1 bg-surface hover:bg-surface-hover text-foreground font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              Voltar
            </button>
            <button
              onClick={() => persistPrelist("list")}
              disabled={loading}
              className="flex-1 border border-accent/40 bg-accent/10 text-accent font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Salvando..." : currentPrelistId ? "Salvar e voltar" : "Salvar pre-lista"}
            </button>
          </div>
          <button
            onClick={() => persistPrelist("teams")}
            disabled={loading || selectedPlayerIds.size === 0 || Boolean(sourceCallupId && selectedPlayerIds.size !== roundCapacity)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 font-bold text-background transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Montar Times <ChevronRight className="w-4 h-4" />
          </button>
          {sourceCallupId && selectedPlayerIds.size !== roundCapacity && <p className="text-center text-[10px] font-semibold text-warning">Complete as {roundCapacity} vagas da convocacao antes de montar os times.</p>}
        </div>
      )}

      {/* STEP 3: Divisão dos Times */}
      {step === 3 && (
        <div className="space-y-6 animate-fade-in">

          {currentPrelistId && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-warning">Pré-lista salva</p>
                <p className="truncate text-xs text-muted">Monte os times ou volte para preparar outra data.</p>
              </div>
              <button type="button" onClick={() => setStep(2)} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-warning/35 bg-background px-3 py-2.5 text-[10px] font-black uppercase text-warning">
                <PencilLine className="h-3.5 w-3.5" /> Editar pré-lista
              </button>
            </div>
          )}

          <div className="glass-card p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <PencilLine className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-black text-foreground">Nome dos times</h2>
                <p className="mt-0.5 text-xs text-muted">Mantenha os nomes padrão ou personalize para esta rodada.</p>
              </div>
            </div>

            <div className="space-y-4">
              {teams.map((team, index) => {
                const currentVest = VEST_COLORS.find(
                  (v) => v.color.toLowerCase() === team.color?.toLowerCase()
                ) || { label: "Personalizado", color: team.color, bg: "bg-accent", text: "text-accent" };

                return (
                  <div key={team.id} className="rounded-2xl border border-border bg-background/50 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted">
                        Time {index + 1}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase"
                        style={{
                          backgroundColor: `${team.color}20`,
                          color: team.color || "#CCFF00",
                          border: `1px solid ${team.color}40`,
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: team.color || "#CCFF00" }}
                        />
                        Colete {currentVest.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
                      <TeamCrest
                        name={team.name || `Time ${index + 1}`}
                        crestUrl={team.crestUrl}
                        color={team.color}
                        className="h-9 w-9"
                      />
                      <input
                        id={`team-name-${team.id}`}
                        type="text"
                        value={team.name}
                        onChange={(event) => updateTeamName(team.id, event.target.value)}
                        maxLength={40}
                        placeholder={`Nome do time ${index + 1}`}
                        className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-foreground outline-none placeholder:text-muted/50"
                      />
                      <span className="text-[9px] font-bold text-muted/60">{team.name.length}/40</span>
                    </div>

                    {/* Seletor Retrátil de Colete */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setOpenVestPickerTeamId(openVestPickerTeamId === team.id ? null : team.id)}
                        className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-surface/70 px-3 py-2 text-left transition-all hover:border-accent/40 hover:bg-surface"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full border border-black/30 shadow-sm"
                            style={{ backgroundColor: team.color || "#CCFF00" }}
                          />
                          <span className="text-[11px] font-bold text-foreground">
                            Colete: <span className="font-black text-accent">{currentVest.label}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase text-muted">
                          <span>{openVestPickerTeamId === team.id ? "Fechar" : "Escolher cor do colete"}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${openVestPickerTeamId === team.id ? "rotate-180 text-accent" : ""}`} />
                        </div>
                      </button>

                      {openVestPickerTeamId === team.id && (
                        <div className="mt-2.5 rounded-xl border border-border bg-background/80 p-2.5 animate-fade-in">
                          <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-muted">
                            Selecione a cor do colete:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {VEST_COLORS.map((vest) => {
                              const isSelected = team.color?.toLowerCase() === vest.color.toLowerCase();
                              return (
                                <button
                                  key={vest.color}
                                  type="button"
                                  onClick={() => {
                                    updateTeamColor(team.id, vest.color);
                                    setOpenVestPickerTeamId(null);
                                  }}
                                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition-all ${
                                    isSelected
                                      ? "border-white bg-white/20 text-white shadow-sm scale-105"
                                      : "border-border/60 bg-black/20 text-muted hover:border-border hover:text-foreground"
                                  }`}
                                >
                                  <span
                                    className="h-3 w-3 rounded-full border border-black/30"
                                    style={{ backgroundColor: vest.color }}
                                  />
                                  {vest.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="glass-card p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">Como montar os times?</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setFormationMode("manual"); setTeams((current) => current.map((team) => ({ ...team, players: [] }))); }}
                className={`rounded-xl border px-2 py-3 text-[10px] font-black uppercase transition-colors ${formationMode === "manual" ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-muted"}`}
              >Manual</button>
              <button
                type="button"
                onClick={() => requestDraw("random")}
                className={`rounded-xl border px-2 py-3 text-[10px] font-black uppercase transition-colors ${formationMode === "random" ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-muted"}`}
              >Aleatorio</button>
              <button
                type="button"
                onClick={() => requestDraw("balanced")}
                className={`rounded-xl border px-2 py-3 text-[10px] font-black uppercase transition-colors ${formationMode === "balanced" ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-muted"}`}
              >Equilibrado</button>
            </div>
            <p className="mt-2 text-[10px] text-muted">
              {formationMode === "manual" ? "Toque em cada jogador e escolha o time." : `${attendanceOrder.length} chegadas registradas · toque no modo novamente para refazer.`}
            </p>
          </div>

          {pendingDrawMode && (
            <div
              className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/90 p-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md animate-fade-in"
              role="dialog"
              aria-modal="true"
              aria-label="Sorteio de times"
            >
              <div
                className="relative flex max-h-[84dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] shadow-[0_0_60px_rgba(0,0,0,0.9)] animate-fade-in-up my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header fixo do Modal */}
                <div className="shrink-0 flex items-start justify-between border-b border-border/70 bg-[#07150d] p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-accent" />
                      <h2 className="text-base font-black uppercase tracking-wide text-foreground">
                        {pendingDrawMode === "random" ? "Sorteio Aleatório" : "Sorteio Equilibrado"}
                      </h2>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Marque a ordem de chegada ou sorteie todos diretamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingDrawMode(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Ações rápidas de presença fixas */}
                <div className="shrink-0 flex items-center justify-between border-b border-border/50 bg-black/30 px-4 py-2.5 text-xs">
                  <span className="text-[10px] font-bold text-muted">
                    {attendanceOrder.length} de {selectedPlayers.length} marcados
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={markAllAttendance}
                      className="text-[10px] font-bold text-accent hover:underline"
                    >
                      Marcar todos
                    </button>
                    {attendanceOrder.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAttendance}
                        className="text-[10px] font-bold text-danger hover:underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista de jogadores com scroll interno suave */}
                <div className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto overscroll-contain">
                  {selectedPlayers.map((player) => {
                    const position = attendanceOrder.indexOf(player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => toggleAttendance(player.id)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${position >= 0 ? "bg-accent/10" : "hover:bg-surface/50"}`}
                      >
                        <span
                          className={`stat-number flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                            position >= 0 ? "bg-accent text-background" : "border border-border bg-surface text-muted"
                          }`}
                        >
                          {position >= 0 ? position + 1 : "—"}
                        </span>
                        <PlayerAvatar
                          name={player.name}
                          avatarUrl={player.avatar_url}
                          className="h-8 w-8 rounded-full text-[10px] font-bold"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-foreground">{player.name}</p>
                          <div className="flex items-center gap-1.5 text-[9px] text-muted">
                            <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />
                            <span>{player.points || 0} pts</span>
                          </div>
                        </div>
                        {position >= 0 && <CheckCircle2 className="h-4 w-4 text-accent" />}
                      </button>
                    );
                  })}
                </div>

                {/* Rodapé fixo com os botões de ação */}
                <div className="shrink-0 space-y-2 border-t border-border/70 bg-[#07150d] p-4">
                  <button
                    type="button"
                    onClick={confirmAttendanceDraw}
                    className="w-full rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
                  >
                    {attendanceOrder.length > 0 ? "Sortear por Ordem de Chegada" : "Sortear Imediatamente"}
                  </button>
                  <button
                    type="button"
                    onClick={() => executeDirectDraw(pendingDrawMode)}
                    className="w-full rounded-xl border border-border bg-surface py-2.5 text-[11px] font-bold text-muted hover:text-foreground transition-colors"
                  >
                    ⚡ Sortear todos diretamente (ignorar chegadas)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Unassigned Pool */}
          {unassignedPlayers.length > 0 && (
            <div>
              <p className="text-xs font-bold text-warning uppercase tracking-wider mb-2 px-1">
                Sem time ({unassignedPlayers.length})
              </p>
              <div className="flex flex-wrap gap-2 glass-card p-3 min-h-[4rem] relative z-50">
                {unassignedPlayers.map(p => (
                  <div key={p.id} className={`relative ${openDropdownId === p.id ? 'z-50' : 'z-10'}`}>
                    <div 
                      onClick={() => setOpenDropdownId(openDropdownId === p.id ? null : p.id)}
                      className="px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-xs font-bold text-foreground cursor-pointer"
                    >
                      <span>{p.name}</span>
                      <PlayerProfileBadge profile={p.player_profile} isGoalkeeper={p.is_goalkeeper} />
                    </div>
                    {/* Menu de times (aberto ao clicar) */}
                    {openDropdownId === p.id && (
                      <div className="absolute top-full left-0 mt-1 flex bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-10 flex-col w-28">
                        {teams.map(t => (
                          <button
                            key={t.id}
                            onClick={() => {
                              assignToTeam(p, t.id);
                              setOpenDropdownId(null);
                            }}
                            disabled={t.players.length >= teamCapacity}
                            className="px-3 py-2 text-left text-[10px] font-bold text-foreground hover:bg-surface-hover flex items-center gap-2 border-b border-border last:border-0 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <TeamCrest name={t.name} crestUrl={t.crestUrl} color={t.color} className="h-5 w-5" />
                            <span className="truncate">{t.name}{t.players.length >= teamCapacity ? " (cheio)" : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted mt-1 px-1">Toque em um jogador para alocá-lo.</p>
            </div>
          )}

          {/* Teams Buckets */}
          <div className="space-y-3">
            {teams.map(team => (
              <div key={team.id} className="glass-card overflow-hidden">
                <div className="px-4 py-2 bg-surface flex items-center justify-between border-b border-border">
                  <div className="flex items-center gap-2">
                    <TeamCrest name={team.name || "Time"} crestUrl={team.crestUrl} color={team.color} className="h-7 w-7" />
                    <span className="max-w-[170px] truncate text-sm font-bold text-foreground">{team.name || "Sem nome"}</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted bg-surface-hover px-2 py-0.5 rounded-md">
                    {team.players.length}/{teamCapacity} jogadores
                  </span>
                </div>
                <div className="p-3 min-h-[3rem] flex flex-wrap gap-2">
                  {team.players.map(p => (
                    <div
                      key={p.id}
                      onClick={() => removeFromTeam(p)}
                      className="px-2 py-1 bg-background border border-border rounded-md text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer hover:border-danger/50 hover:text-danger transition-colors group"
                    >
                      <span>{p.name}</span>
                      <PlayerProfileBadge profile={p.player_profile} isGoalkeeper={p.is_goalkeeper} />
                      <X className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  ))}
                  {team.players.length === 0 && (
                    <span className="text-xs text-muted/50 italic">Vazio</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => currentPrelistId ? router.push("/admin/prelistas") : setStep(2)}
              className="flex-1 bg-surface hover:bg-surface-hover text-foreground font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              Voltar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar Rodada"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
