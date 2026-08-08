"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoundWithTeams, type TeamInput } from "@/lib/actions/rounds";
import type { Player } from "@/lib/types";
import { Users, Calendar, CheckCircle2, ChevronRight } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";

const DEFAULT_TEAMS = [
  { id: "team1", name: "Azul", color: "#3B82F6", players: [] as Player[] },
  { id: "team2", name: "Vermelho", color: "#EF4444", players: [] as Player[] },
  { id: "team3", name: "Preto", color: "#374151", players: [] as Player[] },
];

export function RoundCreator({ allPlayers }: { allPlayers: Player[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  
  // Step 2: Seleção
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  
  // Step 3: Times
  const [teams, setTeams] = useState(DEFAULT_TEAMS);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPlayers = allPlayers.filter(p => selectedPlayerIds.has(p.id));
  
  // Jogadores que estão selecionados para a pelada, mas ainda não foram alocados em nenhum time
  const unassignedPlayers = selectedPlayers.filter(
    p => !teams.some(t => t.players.some(tp => tp.id === p.id))
  );

  function togglePlayerSelection(id: string) {
    const next = new Set(selectedPlayerIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPlayerIds(next);
  }

  function assignToTeam(player: Player, teamId: string) {
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

  function removeFromTeam(player: Player) {
    setTeams(prev => prev.map(t => ({
      ...t,
      players: t.players.filter(p => p.id !== player.id)
    })));
  }

  function handleRandomDraw() {
    const playersToDraw = [...selectedPlayers];
    
    // Fisher-Yates shuffle
    for (let i = playersToDraw.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playersToDraw[i], playersToDraw[j]] = [playersToDraw[j], playersToDraw[i]];
    }

    // Distribui iterativamente
    const newTeams = teams.map(t => ({ ...t, players: [] as Player[] }));
    playersToDraw.forEach((player, index) => {
      const teamIndex = index % newTeams.length;
      newTeams[teamIndex].players.push(player);
    });

    setTeams(newTeams);
  }

  async function handleSave() {
    if (unassignedPlayers.length > 0) {
      if (!confirm(`Ainda há ${unassignedPlayers.length} jogadores sem time. Deseja salvar mesmo assim?`)) {
        return;
      }
    }

    setLoading(true);
    setError("");

    const teamsInput: TeamInput[] = teams.map(t => ({
      name: t.name,
      color: t.color,
      playerIds: t.players.map(p => p.id)
    }));

    // Converte a data local para um formato adequado ou salva como YYYY-MM-DD
    const res = await createRoundWithTeams(date, teamsInput);
    
    if (!res.success) {
      setError(res.error || "Erro ao salvar rodada");
      setLoading(false);
      return;
    }

    router.push(`/rodadas/${res.roundId}`);
  }

  return (
    <div className="space-y-6">
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
        <div className="glass-card p-5 space-y-4 animate-fade-in">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            Quando será a pelada?
          </h2>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
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
              {selectedPlayerIds.size} selecionados
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
                        {player.nickname || player.name}
                      </p>
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
          
          {/* Sorteio */}
          <div className="flex gap-2">
            <button
              onClick={handleRandomDraw}
              className="flex-1 bg-surface border border-border text-foreground hover:bg-surface-hover font-bold py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
            >
              🎲 Sorteio Aleatório
            </button>
            <button
              disabled
              className="flex-1 bg-surface/50 border border-border/50 text-muted font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-not-allowed relative overflow-hidden"
            >
              📊 Por Estatísticas
              <span className="absolute top-0 right-0 bg-accent text-[8px] text-background px-1.5 py-0.5 rounded-bl-lg font-black uppercase tracking-wider">Breve</span>
            </button>
          </div>

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
                      {p.nickname || p.name}
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
                            className="px-3 py-2 text-left text-[10px] font-bold text-foreground hover:bg-surface-hover flex items-center gap-2 border-b border-border last:border-0"
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                            <span className="truncate">{t.name}</span>
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
                    <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: team.color }} />
                    <input
                      type="text"
                      value={team.name}
                      onChange={e => setTeams(teams.map(t => t.id === team.id ? { ...t, name: e.target.value } : t))}
                      className="bg-transparent text-sm font-bold text-foreground focus:outline-none max-w-[100px]"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-muted bg-surface-hover px-2 py-0.5 rounded-md">
                    {team.players.length} jogadores
                  </span>
                </div>
                <div className="p-3 min-h-[3rem] flex flex-wrap gap-2">
                  {team.players.map(p => (
                    <div
                      key={p.id}
                      onClick={() => removeFromTeam(p)}
                      className="px-2 py-1 bg-background border border-border rounded-md text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer hover:border-danger/50 hover:text-danger transition-colors group"
                    >
                      {p.nickname || p.name}
                      <span className="text-[10px] opacity-0 group-hover:opacity-100">✕</span>
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
              onClick={() => setStep(2)}
              className="flex-1 bg-surface hover:bg-surface-hover text-foreground font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              Voltar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Finalizar Rodada"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
