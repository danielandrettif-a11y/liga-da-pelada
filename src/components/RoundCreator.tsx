"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoundWithTeams, type TeamInput } from "@/lib/actions/rounds";
import type { Player, RoundType, TeamFormationMode } from "@/lib/types";
import { drawTeamsByAttendance } from "@/lib/round-draw";
import {
  Users,
  Calendar,
  CheckCircle2,
  ChevronRight,
  PencilLine,
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
  initialDate,
  initialPlayerIds = [],
  roundType = "official",
  callupId = null,
  playersPerTeam = 5,
  teamsPerRound = 3,
  teamPresetOffsets = {},
}: {
  allPlayers: DrawPlayer[];
  initialDate?: string;
  initialPlayerIds?: string[];
  roundType?: RoundType;
  callupId?: string | null;
  playersPerTeam?: number;
  teamsPerRound?: number;
  teamPresetOffsets?: Partial<Record<RoundType, number>>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(initialPlayerIds.length ? 3 : 1);
  const [date, setDate] = useState(() => initialDate || new Date().toISOString().split("T")[0]);
  const [selectedRoundType, setSelectedRoundType] = useState<RoundType>(roundType);
  
  // Step 2: Seleção
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set(initialPlayerIds));
  
  // Step 3: Times
  const teamCount = Math.min(MAX_TEAMS_PER_ROUND, Math.max(MIN_TEAMS_PER_ROUND, Math.trunc(teamsPerRound)));
  const [teams, setTeams] = useState<DrawTeam[]>(() => createDefaultTeams(teamCount, teamPresetOffsets[roundType] || 0));
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [formationMode, setFormationMode] = useState<TeamFormationMode>("manual");
  const [attendanceOrder, setAttendanceOrder] = useState<string[]>([]);
  const [pendingDrawMode, setPendingDrawMode] = useState<Exclude<TeamFormationMode, "manual"> | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const teamCapacity = Math.min(MAX_PLAYERS_PER_TEAM, Math.max(1, Math.trunc(playersPerTeam)));
  const roundCapacity = teamCapacity * teamCount;

  function selectRoundType(type: RoundType) {
    if (callupId) return;
    setSelectedRoundType(type);
    setTeams(createDefaultTeams(teamCount, teamPresetOffsets[type] || 0));
  }

  const selectedPlayers = allPlayers.filter(p => selectedPlayerIds.has(p.id));
  
  // Jogadores que estão selecionados para a pelada, mas ainda não foram alocados em nenhum time
  const unassignedPlayers = selectedPlayers.filter(
    p => !teams.some(t => t.players.some(tp => tp.id === p.id))
  );

  function togglePlayerSelection(id: string) {
    if (callupId) return;
    const next = new Set(selectedPlayerIds);
    if (next.has(id)) next.delete(id);
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

  function requestDraw(mode: Exclude<TeamFormationMode, "manual">) {
    const minimumPresent = teamCapacity * 2;
    if (selectedPlayers.length < minimumPresent) {
      setError(`Selecione pelo menos ${minimumPresent} jogadores para formar dois times completos.`);
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

  function confirmAttendanceDraw() {
    if (!pendingDrawMode) return;
    try {
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
      setFormationMode(pendingDrawMode);
      setPendingDrawMode(null);
      setError("");
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "Nao foi possivel sortear os times.");
    }
  }

  function updateTeamName(teamId: string, name: string) {
    setTeams((current) => current.map((team) => (
      team.id === teamId ? { ...team, name } : team
    )));
    setError("");
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

    if (unassignedPlayers.length > 0) {
      if (!confirm(`Ainda há ${unassignedPlayers.length} jogadores sem time. Deseja salvar mesmo assim?`)) {
        return;
      }
    }

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
      callupId,
      formationMode,
      attendanceOrder: formationMode === "manual" ? [] : attendanceOrder,
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
        {callupId && <span className="ml-1 text-muted">· {initialPlayerIds.length} convocados pré-selecionados</span>}
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
          <fieldset className="space-y-2">
            <legend className="text-xs font-black uppercase tracking-wider text-muted">Tipo de pelada</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={Boolean(callupId)} onClick={() => selectRoundType("official")} className={`rounded-xl border px-3 py-3 text-xs font-black transition-colors ${selectedRoundType === "official" ? "border-accent bg-accent text-background" : "border-border bg-background text-muted"}`}>Ranked</button>
              <button type="button" disabled={Boolean(callupId)} onClick={() => selectRoundType("friendly")} className={`rounded-xl border px-3 py-3 text-xs font-black transition-colors ${selectedRoundType === "friendly" ? "border-warning bg-warning text-background" : "border-border bg-background text-muted"}`}>Amistoso</button>
            </div>
            {callupId && <p className="text-[10px] text-muted">O tipo foi definido pela convocação e não pode ser alterado.</p>}
          </fieldset>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            Quando será a pelada?
          </h2>
          <div className="grid min-w-0 w-full">
            <input
              type="date"
              value={date}
              disabled={Boolean(callupId)}
              onChange={e => setDate(e.target.value)}
              className="block min-w-0 max-w-full w-full appearance-none bg-surface-hover border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
            />
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              Quem vai jogar?
            </h2>
            <span className="text-xs font-bold px-2 py-1 bg-surface-hover rounded-lg text-muted">
              {selectedPlayerIds.size}/{roundCapacity} selecionados
            </span>
          </div>

          <div className="glass-card overflow-hidden max-h-[50vh] overflow-y-auto no-scrollbar">
            {allPlayers.map((player, idx) => {
              const isSelected = selectedPlayerIds.has(player.id);
              return (
                <div
                  key={player.id}
                  onClick={() => togglePlayerSelection(player.id)}
                  className={`
                    flex items-center justify-between p-3 cursor-pointer transition-colors
                    ${idx < allPlayers.length - 1 ? "border-b border-border" : ""}
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
              onClick={() => setStep(1)}
              className="flex-1 bg-surface hover:bg-surface-hover text-foreground font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedPlayerIds.size === 0}
              className="flex-1 bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Montar Times <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Divisão dos Times */}
      {step === 3 && (
        <div className="space-y-6 animate-fade-in">

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

            <div className="space-y-3">
              {teams.map((team, index) => (
                <label key={team.id} className="block" htmlFor={`team-name-${team.id}`}>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted">
                    Time {index + 1}
                  </span>
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background/50 px-3 focus-within:border-accent">
                    <TeamCrest name={team.name || `Time ${index + 1}`} crestUrl={team.crestUrl} color={team.color} className="h-9 w-9" />
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
                </label>
              ))}
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
            <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Lista de presenca">
              <div className="max-h-[88vh] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
                <div className="flex items-start justify-between border-b border-border p-5">
                  <div>
                    <h2 className="text-lg font-black text-foreground">Lista de Presenca</h2>
                    <p className="mt-1 text-xs text-muted">Marque na ordem em que as pessoas chegaram.</p>
                  </div>
                  <button type="button" onClick={() => setPendingDrawMode(null)} className="rounded-full bg-surface p-2 text-muted"><X className="h-4 w-4" /></button>
                </div>
                <div className="max-h-[58vh] divide-y divide-border overflow-y-auto">
                  {selectedPlayers.map((player) => {
                    const position = attendanceOrder.indexOf(player.id);
                    return (
                      <button key={player.id} type="button" onClick={() => toggleAttendance(player.id)} className={`flex w-full items-center gap-3 px-5 py-3 text-left ${position >= 0 ? "bg-accent/5" : ""}`}>
                        <span className={`stat-number flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${position >= 0 ? "bg-accent text-background" : "border border-border bg-surface text-muted"}`}>{position >= 0 ? position + 1 : "—"}</span>
                        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="h-10 w-10 rounded-full text-xs font-bold" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{player.name}</span>
                        {position >= 0 && <CheckCircle2 className="h-5 w-5 text-accent" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-border p-4">
                  <p className="mb-3 text-center text-xs font-bold text-muted">{attendanceOrder.length}/{teamCapacity * 2} presencas minimas</p>
                  <button type="button" onClick={confirmAttendanceDraw} disabled={attendanceOrder.length < teamCapacity * 2} className="w-full rounded-xl bg-accent py-3.5 text-sm font-black text-background disabled:opacity-40">
                    Sortear Times
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
            {!callupId && <button
              onClick={() => setStep(2)}
              className="flex-1 bg-surface hover:bg-surface-hover text-foreground font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              Voltar
            </button>}
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
