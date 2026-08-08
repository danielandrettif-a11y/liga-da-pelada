"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerGoal, finishMatch, deleteEvent } from "@/lib/actions/matches";
import { ArrowLeft, Plus, Clock, Trophy, Trash2, Play, Pause, RotateCcw } from "lucide-react";
import Link from "next/link";
import { getInitials } from "@/lib/utils";

type MatchLiveBoardProps = {
  match: any;
  matchDuration: number;
};

export function MatchLiveBoard({ match, matchDuration }: MatchLiveBoardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Timer State
  const initialSeconds = matchDuration * 60;
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      setIsRunning(false);
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(initialSeconds);
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  // Estado para o modal de Gol
  const [goalModal, setGoalModal] = useState<{
    open: boolean;
    teamId: string;
    scorerId: string | null;
  }>({ open: false, teamId: "", scorerId: null });

  const isFinished = match.status === "finished";

  async function handleFinish() {
    if (!confirm("Tem certeza que deseja encerrar esta partida? O placar não poderá mais ser alterado.")) return;
    
    setLoading(true);
    const res = await finishMatch(match.id);
    if (!res.success) {
      setError(res.error || "Erro ao finalizar");
      setLoading(false);
      return;
    }
    // Sucesso - o component server fará o reload pra exibir "isFinished"
    setLoading(false);
  }

  async function handleRegisterGoal(assistPlayerId: string | null = null) {
    if (!goalModal.scorerId) return;

    setLoading(true);
    const res = await registerGoal({
      match_id: match.id,
      player_id: goalModal.scorerId,
      assist_player_id: assistPlayerId || undefined,
      team_id: goalModal.teamId,
      minute: Math.floor((initialSeconds - secondsLeft) / 60),
    });

    if (!res.success) {
      setError(res.error || "Erro ao registrar gol");
      setLoading(false);
      return;
    }

    setGoalModal({ open: false, teamId: "", scorerId: null });
    setLoading(false);
  }

  async function handleDeleteEvent(eventId: string, teamId: string) {
    if (isFinished) return;
    if (!confirm("Deseja remover este gol?")) return;

    setLoading(true);
    const res = await deleteEvent(eventId, match.id, teamId);
    if (!res.success) setError(res.error || "Erro ao deletar");
    setLoading(false);
  }

  // Helpers para o Modal
  const activeTeam = match.team_a_id === goalModal.teamId ? match.team_a : match.team_b;
  const otherPlayers = activeTeam?.team_players.filter((tp: any) => tp.player_id !== goalModal.scorerId) || [];

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href={`/rodadas/${match.round_id}`}
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isFinished ? 'bg-muted/20 text-muted' : 'bg-accent/20 text-accent animate-pulse'}`}>
          {isFinished ? 'Finalizada' : 'Em Andamento'}
        </div>
      </div>

      {error && (
        <div className="w-full p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold text-center">
          {error}
        </div>
      )}

      {/* Cronômetro e Placar */}
      <div className="glass-card p-6 flex flex-col items-center animate-fade-in">
        
        {/* Timer Section */}
        {!isFinished && (
          <div className="flex flex-col items-center mb-6 w-full">
            <div className={`text-4xl font-black font-mono tracking-wider ${secondsLeft <= 60 && secondsLeft > 0 ? 'text-danger animate-pulse' : 'text-foreground'}`}>
              {formatTime(secondsLeft)}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={toggleTimer}
                className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover border border-border flex items-center justify-center text-foreground transition-all active:scale-95"
              >
                {isRunning ? <Pause className="w-4 h-4 text-warning" /> : <Play className="w-4 h-4 text-accent" />}
              </button>
              <button
                onClick={resetTimer}
                className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover border border-border flex items-center justify-center text-foreground transition-all active:scale-95"
              >
                <RotateCcw className="w-4 h-4 text-muted" />
              </button>
            </div>
            <div className="w-full h-px bg-border my-4" />
          </div>
        )}

        <div className="flex items-center justify-between w-full">
          {/* Team A */}
        <div className="flex flex-col items-center gap-3 flex-1">
          <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center bg-surface" style={{ borderColor: match.team_a.color }}>
            <span className="text-sm font-bold truncate max-w-[3rem]">{match.team_a.name}</span>
          </div>
          <span className="stat-number text-5xl text-foreground">{match.score_a}</span>
          
          {!isFinished && (
            <button
              onClick={() => setGoalModal({ open: true, teamId: match.team_a_id, scorerId: null })}
              disabled={loading}
              className="mt-2 w-12 h-12 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center text-foreground border border-border transition-transform active:scale-95 disabled:opacity-50"
            >
              <Plus className="w-6 h-6" />
            </button>
          )}
        </div>

        <div className="text-2xl font-black text-muted px-4">×</div>

        {/* Team B */}
        <div className="flex flex-col items-center gap-3 flex-1">
          <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center bg-surface" style={{ borderColor: match.team_b.color }}>
            <span className="text-sm font-bold truncate max-w-[3rem]">{match.team_b.name}</span>
          </div>
          <span className="stat-number text-5xl text-foreground">{match.score_b}</span>
          
          {!isFinished && (
            <button
              onClick={() => setGoalModal({ open: true, teamId: match.team_b_id, scorerId: null })}
              disabled={loading}
              className="mt-2 w-12 h-12 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center text-foreground border border-border transition-transform active:scale-95 disabled:opacity-50"
            >
              <Plus className="w-6 h-6" />
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Timeline de Eventos */}
      <section className="animate-fade-in-up stagger-1">
        <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> Timeline
        </h2>
        
        <div className="space-y-2">
          {match.match_events?.length === 0 ? (
            <div className="glass-card p-4 text-center text-xs text-muted">
              Nenhum gol registrado ainda.
            </div>
          ) : (
            match.match_events?.map((ev: any) => {
              const isTeamA = ev.team_id === match.team_a_id;
              
              return (
                <div key={ev.id} className="glass-card p-3 flex items-center gap-3 relative overflow-hidden">
                  <div className={`absolute top-0 bottom-0 w-1 ${isTeamA ? 'left-0' : 'right-0'}`} style={{ backgroundColor: isTeamA ? match.team_a.color : match.team_b.color }} />
                  
                  <div className={`flex items-center gap-3 w-full ${isTeamA ? 'flex-row' : 'flex-row-reverse text-right'}`}>
                    <div className="text-2xl">⚽</div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">
                        {ev.player?.nickname || ev.player?.name}
                      </p>
                      {ev.assist_player && (
                        <p className="text-[10px] text-muted flex items-center gap-1 justify-start">
                          <span className={`${!isTeamA && 'ml-auto'}`}>Pass: {ev.assist_player?.nickname || ev.assist_player?.name}</span>
                        </p>
                      )}
                    </div>

                    {!isFinished && (
                      <button
                        onClick={() => handleDeleteEvent(ev.id, ev.team_id)}
                        disabled={loading}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Finalizar Button */}
      {!isFinished && (
        <div className="pt-6 animate-fade-in-up stagger-2">
          <button
            onClick={handleFinish}
            disabled={loading}
            className="w-full bg-surface border border-danger/30 hover:bg-danger/10 text-danger font-bold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Trophy className="w-5 h-5" />
            Encerrar Partida
          </button>
        </div>
      )}

      {/* MODAL DE REGISTRO DE GOL */}
      {goalModal.open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in pb-8">
          <div className="glass-card w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh] animate-slide-in-bottom">
            <div className="p-4 bg-surface border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">
                {goalModal.scorerId ? "Quem deu o passe?" : "Quem fez o gol?"}
              </h3>
              <button onClick={() => setGoalModal({ open: false, teamId: "", scorerId: null })} className="text-muted hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto no-scrollbar space-y-2 flex-1">
              {!goalModal.scorerId ? (
                // SELECIONAR ARTILHEIRO
                activeTeam?.team_players.map((tp: any) => (
                  <button
                    key={tp.player_id}
                    onClick={() => setGoalModal(p => ({ ...p, scorerId: tp.player_id }))}
                    className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-xs font-bold">
                      {getInitials(tp.players?.name)}
                    </div>
                    <span className="font-bold text-foreground flex-1">{tp.players?.nickname || tp.players?.name}</span>
                    <span className="text-xl">⚽</span>
                  </button>
                ))
              ) : (
                // SELECIONAR ASSISTÊNCIA
                <>
                  <button
                    onClick={() => handleRegisterGoal(null)}
                    disabled={loading}
                    className="w-full p-4 bg-accent/20 border border-accent text-accent font-bold rounded-xl mb-4 hover:bg-accent hover:text-background transition-colors"
                  >
                    Sem assistência (Jogada Individual)
                  </button>

                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Com passe de:</p>
                  
                  {otherPlayers.map((tp: any) => (
                    <button
                      key={tp.player_id}
                      onClick={() => handleRegisterGoal(tp.player_id)}
                      disabled={loading}
                      className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-xs font-bold">
                        {getInitials(tp.players?.name)}
                      </div>
                      <span className="font-bold text-foreground flex-1">{tp.players?.nickname || tp.players?.name}</span>
                      <span className="text-xl">🎯</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
