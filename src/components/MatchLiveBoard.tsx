"use client";

import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  registerGoal,
  finishMatch,
  deleteEvent,
  correctFinishedGoal,
  updateMatchTimer,
  resetMatchTimer,
  addMatchExtraTime,
  undoLastMatchSubstitution,
} from "@/lib/actions/matches";
import {
  ArrowLeft,
  Plus,
  Clock,
  Trophy,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Football,
  Target,
  X,
  ArrowLeftRight,
} from "@/components/icons";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PlayerAvatar } from "./PlayerAvatar";
import { MatchSubstitutionManager } from "./MatchSubstitutionManager";
import {
  getMatchTimerElapsedSeconds,
  getOfficialElapsedSeconds,
  transitionMatchTimer,
} from "@/lib/match-rules";
import { TeamCrest } from "./TeamCrest";
import { useDialogViewport } from "@/lib/useDialogViewport";

// ============================================
// MatchTimer: Isolado com memo para evitar re-render global da tela a cada segundo
// ============================================
type MatchTimerProps = {
  initialSeconds: number;
  timerState: { startedAt: string | null; accumulated: number };
  canManage: boolean;
  timerSaving: boolean;
  onToggle: () => void;
  onReset: () => void;
  onAddExtraTime: (seconds: number) => void;
};

const MatchTimer = memo(function MatchTimer({
  initialSeconds,
  timerState,
  canManage,
  timerSaving,
  onToggle,
  onReset,
  onAddExtraTime,
}: MatchTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, initialSeconds - getMatchTimerElapsedSeconds(timerState))
  );
  const isRunning = !!timerState.startedAt;

  useEffect(() => {
    const updateTimer = () => {
      setSecondsLeft(Math.max(0, initialSeconds - getMatchTimerElapsedSeconds(timerState)));
    };

    updateTimer();

    if (timerState.startedAt) {
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [timerState, initialSeconds]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center mb-6 w-full">
      {secondsLeft <= 60 && secondsLeft > 0 && (
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-danger animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-danger shadow-[0_0_8px_var(--danger)]" />
          Último minuto
        </div>
      )}
      <div className="text-4xl font-black font-mono tracking-wider text-foreground">
        {formatTime(secondsLeft)}
      </div>
      {canManage ? (
        <div className="flex flex-col items-center gap-2 mt-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onToggle}
              disabled={timerSaving}
              className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover border border-border flex items-center justify-center text-foreground transition-all active:scale-95 disabled:opacity-60"
              aria-label={isRunning ? "Pausar cronômetro" : "Iniciar cronômetro"}
            >
              {isRunning ? <Pause className="w-4 h-4 text-warning" /> : <Play className="w-4 h-4 text-accent" />}
            </button>
            <button
              onClick={onReset}
              disabled={timerSaving}
              className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover border border-border flex items-center justify-center text-foreground transition-all active:scale-95 disabled:opacity-60"
              aria-label="Zerar cronômetro"
            >
              <RotateCcw className="w-4 h-4 text-muted" />
            </button>
          </div>

          {/* Botões de Acréscimo */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] font-black uppercase tracking-wider text-muted mr-1">
              Acréscimos:
            </span>
            <button
              type="button"
              disabled={timerSaving}
              onClick={() => onAddExtraTime(60)}
              className="rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-black text-accent transition-transform active:scale-95 disabled:opacity-50"
              title="Adicionar 1 minuto de acréscimo"
            >
              +1&apos;
            </button>
            <button
              type="button"
              disabled={timerSaving}
              onClick={() => onAddExtraTime(120)}
              className="rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-black text-accent transition-transform active:scale-95 disabled:opacity-50"
              title="Adicionar 2 minutos de acréscimo"
            >
              +2&apos;
            </button>
            <button
              type="button"
              disabled={timerSaving}
              onClick={() => onAddExtraTime(180)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[10px] font-bold text-muted hover:text-foreground transition-transform active:scale-95 disabled:opacity-50"
              title="Adicionar 3 minutos de acréscimo"
            >
              +3&apos;
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted">
          Acompanhamento ao vivo
        </p>
      )}
      <div className="w-full h-px bg-border my-4" />
    </div>
  );
});

// ============================================
// MatchLiveBoard: Tabuleiro Principal
// ============================================
type MatchLiveBoardProps = {
  match: any;
  matchDuration: number;
  canManage: boolean;
};

export function MatchLiveBoard({ match, matchDuration, canManage }: MatchLiveBoardProps) {
  const router = useRouter();
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingGoalRef = useRef(false);
  const deletingEventRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Placar e Eventos locais para Optimistic UI
  const [displayScore, setDisplayScore] = useState({
    a: Number(match.score_a || 0),
    b: Number(match.score_b || 0),
  });
  const [events, setEvents] = useState<any[]>(() => match.match_events || []);

  // Timer State
  const initialSeconds = match.duration_seconds || matchDuration * 60;
  const [durationSeconds, setDurationSeconds] = useState(initialSeconds);
  const [timerState, setTimerState] = useState({
    startedAt: match.timer_started_at as string | null,
    accumulated: Number(match.timer_accumulated_seconds || 0),
  });
  const [timerSaving, setTimerSaving] = useState(false);
  const [eligibilityOffset, setEligibilityOffset] = useState(
    Number(match.eligibility_elapsed_offset_seconds || 0)
  );

  const isFinished = match.status === "finished";

  // Sincronizações com props vindas do servidor
  useEffect(() => {
    if (match.duration_seconds) {
      setDurationSeconds(match.duration_seconds);
    }
  }, [match.duration_seconds]);

  useEffect(() => {
    setTimerState({
      startedAt: match.timer_started_at as string | null,
      accumulated: Number(match.timer_accumulated_seconds || 0),
    });
  }, [match.timer_started_at, match.timer_accumulated_seconds]);

  useEffect(() => {
    setDisplayScore({ a: Number(match.score_a || 0), b: Number(match.score_b || 0) });
  }, [match.score_a, match.score_b]);

  useEffect(() => {
    setEvents(match.match_events || []);
  }, [match.match_events]);

  useEffect(() => {
    setEligibilityOffset(Number(match.eligibility_elapsed_offset_seconds || 0));
  }, [match.eligibility_elapsed_offset_seconds]);

  // Escuta mudanças em tempo real no Supabase Realtime
  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
      refreshTimeout.current = setTimeout(() => router.refresh(), 120);
    };

    const channel = supabase
      .channel(`match-${match.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${match.id}` }, () => {
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${match.id}` }, () => {
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_players", filter: `match_id=eq.${match.id}` }, () => {
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_substitutions", filter: `match_id=eq.${match.id}` }, () => {
        scheduleRefresh();
      })
      .subscribe();

    return () => {
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
      supabase.removeChannel(channel);
    };
  }, [match.id, router]);

  // Controles do cronômetro
  const toggleTimer = useCallback(async () => {
    if (!canManage || timerSaving) return;
    const isRunning = !!timerState.startedAt;
    const previous = timerState;
    const action = isRunning ? "pause" : "start";
    const next = transitionMatchTimer(timerState, action);
    setTimerState(next);
    setTimerSaving(true);
    setError("");

    const result = await updateMatchTimer(match.id, action);
    if (!result.success) {
      setTimerState(previous);
      setError(result.error || "Não foi possível atualizar o cronômetro.");
    }
    setTimerSaving(false);
  }, [canManage, timerSaving, timerState, match.id]);

  const resetTimer = useCallback(async () => {
    if (!canManage || timerSaving) return;
    if (confirm("Deseja realmente zerar o cronômetro?")) {
      const previous = timerState;
      const previousOffset = eligibilityOffset;
      const elapsedBeforeReset = getMatchTimerElapsedSeconds(timerState);
      setTimerState({ startedAt: null, accumulated: 0 });
      setEligibilityOffset((current) => current + elapsedBeforeReset);
      setTimerSaving(true);

      const result = await resetMatchTimer(match.id);
      if (!result.success) {
        setTimerState(previous);
        setEligibilityOffset(previousOffset);
        setError(result.error || "Não foi possível zerar o cronômetro.");
      }
      setTimerSaving(false);
    }
  }, [canManage, timerSaving, timerState, eligibilityOffset, match.id]);

  const addExtraTime = useCallback(async (seconds: number) => {
    if (!canManage || timerSaving) return;
    setDurationSeconds((current: number) => current + seconds);
    setTimerSaving(true);
    setError("");

    const result = await addMatchExtraTime(match.id, seconds);
    if (!result.success) {
      setDurationSeconds((current: number) => Math.max(60, current - seconds));
      setError(result.error || "Não foi possível adicionar acréscimo.");
    }
    setTimerSaving(false);
  }, [canManage, timerSaving, match.id]);

  // Modal de Gol
  const [goalModal, setGoalModal] = useState<{
    open: boolean;
    teamId: string;
    scorerId: string | null;
  }>({ open: false, teamId: "", scorerId: null });
  useDialogViewport(goalModal.open);

  // Jogadores ativos para o modal
  const activePlayers = useMemo(() => {
    return (match.match_players || []).filter(
      (entry: any) => entry.team_id === goalModal.teamId && entry.is_active
    );
  }, [match.match_players, goalModal.teamId]);

  const otherPlayers = useMemo(() => {
    return activePlayers.filter((entry: any) => entry.player_id !== goalModal.scorerId);
  }, [activePlayers, goalModal.scorerId]);

  // Timeline unificada e ordenada
  const timelineItems = useMemo(() => {
    return [
      ...events.map((event: any) => ({ ...event, timelineType: "goal" as const })),
      ...(match.match_substitutions || []).map((sub: any) => ({ ...sub, timelineType: "substitution" as const })),
    ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [events, match.match_substitutions]);

  // Encerramento da partida
  async function handleFinish() {
    if (!canManage) return;
    if (!confirm("Tem certeza que deseja encerrar esta partida? O placar não poderá mais ser alterado.")) return;

    setLoading(true);
    const res = await finishMatch(match.id);
    if (!res.success) {
      setError(res.error || "Erro ao finalizar a partida.");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  // Registro de gol (Optimistic UI com proteção double-tap e RPC transacional)
  async function handleRegisterGoal(assistPlayerId: string | null = null) {
    if (!canManage || submittingGoalRef.current || !goalModal.scorerId) return;
    submittingGoalRef.current = true;

    const request = { ...goalModal };
    const previousScore = displayScore;
    const previousEvents = events;
    const isTeamA = match.team_a_id === request.teamId;

    // Idempotency Key única para esta submissão
    const idempotencyKey = `goal-${match.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Cálculo do minuto oficial
    const elapsedSecs = getMatchTimerElapsedSeconds(timerState);
    const minute = Math.floor(getOfficialElapsedSeconds(elapsedSecs, eligibilityOffset) / 60);

    // Dados do jogador para UI instantânea
    const scorerEntry = activePlayers.find((p: any) => p.player_id === request.scorerId);
    const assistEntry = assistPlayerId ? activePlayers.find((p: any) => p.player_id === assistPlayerId) : null;

    const optimisticEvent = {
      id: `opt-${idempotencyKey}`,
      match_id: match.id,
      player_id: request.scorerId!,
      assist_player_id: assistPlayerId || null,
      team_id: request.teamId,
      event_type: "goal",
      minute,
      created_at: new Date().toISOString(),
      player: scorerEntry?.player || { name: "Jogador" },
      assist_player: assistEntry?.player || null,
      isOptimistic: true,
    };

    // 1. Atualização otimista imediata (< 10ms)
    setDisplayScore((current) =>
      isTeamA ? { ...current, a: current.a + 1 } : { ...current, b: current.b + 1 }
    );
    setEvents((prev) => [optimisticEvent, ...prev]);
    setGoalModal({ open: false, teamId: "", scorerId: null });
    setError("");
    setLoading(true);

    try {
      // 2. Chamada atômica ao Supabase via RPC
      const res = await registerGoal({
        match_id: match.id,
        player_id: request.scorerId!,
        assist_player_id: assistPlayerId || undefined,
        team_id: request.teamId,
        minute,
        idempotency_key: idempotencyKey,
      });

      if (!res.success) {
        // Rollback consistente se a RPC falhar
        setDisplayScore(previousScore);
        setEvents(previousEvents);
        setGoalModal(request);
        setError(res.error || "Erro ao registrar gol.");
      }
    } catch (err: any) {
      // Rollback em caso de erro de rede
      setDisplayScore(previousScore);
      setEvents(previousEvents);
      setGoalModal(request);
      setError(err?.message || "Erro inesperado ao registrar gol.");
    } finally {
      setLoading(false);
      submittingGoalRef.current = false;
    }
  }

  // Remoção de gol (Optimistic UI com RPC transacional)
  async function handleDeleteEvent(eventId: string, teamId: string) {
    if (!canManage || deletingEventRef.current.has(eventId)) return;

    if (isFinished) {
      const confirmation = window.prompt(
        "Esta correção recalculará placar, Ranking e Cartola. Digite CORRIGIR para remover o gol."
      );
      if (confirmation !== "CORRIGIR") return;
      setLoading(true);
      const result = await correctFinishedGoal(eventId);
      if (!result.success) setError(result.error || "Não foi possível corrigir o gol.");
      setLoading(false);
      return;
    }

    if (!confirm("Deseja remover este gol?")) return;

    deletingEventRef.current.add(eventId);
    const previousScore = displayScore;
    const previousEvents = events;
    const isTeamA = match.team_a_id === teamId;

    // Atualização otimista imediata
    setDisplayScore((current) =>
      isTeamA
        ? { ...current, a: Math.max(0, current.a - 1) }
        : { ...current, b: Math.max(0, current.b - 1) }
    );
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setError("");
    setLoading(true);

    try {
      const res = await deleteEvent(eventId, match.id, teamId);
      if (!res.success) {
        setDisplayScore(previousScore);
        setEvents(previousEvents);
        setError(res.error || "Erro ao deletar evento.");
      }
    } catch (err: any) {
      setDisplayScore(previousScore);
      setEvents(previousEvents);
      setError(err?.message || "Erro inesperado ao deletar evento.");
    } finally {
      setLoading(false);
      deletingEventRef.current.delete(eventId);
    }
  }

  async function handleUndoSubstitution(substitutionId: string) {
    if (!canManage || isFinished) return;
    if (!confirm("Desfazer a última substituição registrada?")) return;
    setLoading(true);
    const result = await undoLastMatchSubstitution(substitutionId, match.id);
    if (!result.success) setError(result.error || "Não foi possível desfazer a substituição.");
    setLoading(false);
  }

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
        <div
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            isFinished
              ? "bg-muted/20 text-muted"
              : "bg-accent/20 text-accent animate-pulse"
          }`}
        >
          {isFinished ? "Finalizada" : "Em Andamento"}
        </div>
      </div>

      {error && (
        <div className="w-full p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold text-center animate-fade-in">
          {error}
        </div>
      )}

      {/* Cronômetro e Placar */}
      <div className="glass-card flex flex-col items-center p-4 animate-fade-in sm:p-6">
        {/* Timer Section (Isolado com memo) */}
        {!isFinished && (
          <MatchTimer
            initialSeconds={durationSeconds}
            timerState={timerState}
            canManage={canManage}
            timerSaving={timerSaving}
            onToggle={toggleTimer}
            onReset={resetTimer}
            onAddExtraTime={addExtraTime}
          />
        )}

        <div className="flex items-center justify-between w-full">
          {/* Team A */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:gap-3">
            <TeamCrest
              name={match.team_a.name}
              crestUrl={match.team_a.crest_url}
              color={match.team_a.color}
              className="h-14 w-14 sm:h-16 sm:w-16"
            />
            <span className="max-w-[8rem] truncate text-center text-xs font-black text-foreground">
              {match.team_a.name}
            </span>
            <span className="stat-number text-5xl text-foreground">{displayScore.a}</span>

            {!isFinished && canManage && (
              <button
                onClick={() => setGoalModal({ open: true, teamId: match.team_a_id, scorerId: null })}
                disabled={loading}
                className="mt-2 w-12 h-12 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center text-foreground border border-border transition-transform active:scale-95 disabled:opacity-50"
                aria-label={`Registrar gol para ${match.team_a.name}`}
              >
                <Plus className="w-6 h-6" />
              </button>
            )}
          </div>

          <div className="px-2 text-2xl font-black text-muted sm:px-4">×</div>

          {/* Team B */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:gap-3">
            <TeamCrest
              name={match.team_b.name}
              crestUrl={match.team_b.crest_url}
              color={match.team_b.color}
              className="h-14 w-14 sm:h-16 sm:w-16"
            />
            <span className="max-w-[8rem] truncate text-center text-xs font-black text-foreground">
              {match.team_b.name}
            </span>
            <span className="stat-number text-5xl text-foreground">{displayScore.b}</span>

            {!isFinished && canManage && (
              <button
                onClick={() => setGoalModal({ open: true, teamId: match.team_b_id, scorerId: null })}
                disabled={loading}
                className="mt-2 w-12 h-12 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center text-foreground border border-border transition-transform active:scale-95 disabled:opacity-50"
                aria-label={`Registrar gol para ${match.team_b.name}`}
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
          {timelineItems.length === 0 ? (
            <div className="glass-card p-4 text-center text-xs text-muted">
              Nenhum evento registrado ainda.
            </div>
          ) : (
            timelineItems.map((ev: any, index: number) => {
              const isTeamA = ev.team_id === match.team_a_id;
              if (ev.timelineType === "substitution") {
                const minutes = Math.floor(ev.elapsed_seconds / 60)
                  .toString()
                  .padStart(2, "0");
                const seconds = (ev.elapsed_seconds % 60).toString().padStart(2, "0");
                return (
                  <div
                    key={`sub-${ev.id}`}
                    className="glass-card relative flex items-center gap-3 overflow-hidden p-3"
                  >
                    <div
                      className={`absolute bottom-0 top-0 w-1 ${isTeamA ? "left-0" : "right-0"}`}
                      style={{ backgroundColor: isTeamA ? match.team_a.color : match.team_b.color }}
                    />
                    <ArrowLeftRight className="h-6 w-6 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-foreground">
                        Sai {ev.player_out?.name}
                        {ev.player_in ? ` · Entra ${ev.player_in.name}` : " · Sem substituto"}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {ev.player_in_original_team
                          ? `Emprestado do ${ev.player_in_original_team.name} · `
                          : ""}
                        {minutes}:{seconds}
                        {ev.marked_injured ? " · marcado como machucado" : ""}
                      </p>
                    </div>
                    {!isFinished && canManage && index === 0 && (
                      <button
                        type="button"
                        onClick={() => handleUndoSubstitution(ev.id)}
                        disabled={loading}
                        className="shrink-0 rounded-lg border border-border px-2.5 py-2 text-[9px] font-black uppercase text-muted hover:text-foreground disabled:opacity-50"
                      >
                        Desfazer
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={ev.id}
                  className={`glass-card p-3 flex items-center gap-3 relative overflow-hidden transition-opacity ${
                    ev.isOptimistic ? "opacity-75" : "opacity-100"
                  }`}
                >
                  <div
                    className={`absolute top-0 bottom-0 w-1 ${isTeamA ? "left-0" : "right-0"}`}
                    style={{ backgroundColor: isTeamA ? match.team_a.color : match.team_b.color }}
                  />

                  <div
                    className={`flex items-center gap-3 w-full ${
                      isTeamA ? "flex-row" : "flex-row-reverse text-right"
                    }`}
                  >
                    <Football className="h-6 w-6 text-accent" strokeWidth={1.8} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">
                        {ev.player?.name}
                        {ev.minute !== null && ev.minute !== undefined && (
                          <span className="ml-1.5 text-[10px] font-normal text-muted">
                            ({ev.minute}&apos;)
                          </span>
                        )}
                      </p>
                      {ev.assist_player && (
                        <p className="text-[10px] text-muted flex items-center gap-1 justify-start">
                          <span className={`${!isTeamA && "ml-auto"}`}>
                            Passe: {ev.assist_player?.name}
                          </span>
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <button
                        onClick={() => handleDeleteEvent(ev.id, ev.team_id)}
                        disabled={loading || ev.isOptimistic}
                        title={isFinished ? "Corrigir gol finalizado" : "Remover gol"}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                        aria-label="Remover gol"
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

      {/* Substituições */}
      <MatchSubstitutionManager
        match={match}
        canManage={canManage}
        elapsedSeconds={getOfficialElapsedSeconds(
          getMatchTimerElapsedSeconds(timerState),
          match.eligibility_elapsed_offset_seconds || 0
        )}
      />

      {/* Botão de Encerrar Partida */}
      {!isFinished && canManage && (
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
      {goalModal.open && canManage && (
        <div className="mobile-dialog-backdrop bg-background/85 backdrop-blur-sm animate-fade-in">
          <div className="glass-card flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-sm flex-col overflow-hidden animate-fade-in-up sm:max-h-[85dvh]">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface p-4">
              <h3 className="font-bold text-foreground">
                {goalModal.scorerId ? "Quem deu o passe?" : "Quem fez o gol?"}
              </h3>
              <button
                onClick={() => setGoalModal({ open: false, teamId: "", scorerId: null })}
                className="text-muted hover:text-foreground"
                aria-label="Fechar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4 pb-6">
              {!goalModal.scorerId ? (
                // SELECIONAR ARTILHEIRO
                activePlayers.map((tp: any) => (
                  <button
                    key={tp.player_id}
                    onClick={() => setGoalModal((p) => ({ ...p, scorerId: tp.player_id }))}
                    className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors text-left"
                  >
                    <PlayerAvatar
                      name={tp.player?.name || "Jogador"}
                      avatarUrl={tp.player?.avatar_url}
                      className="w-10 h-10 rounded-full bg-background text-xs font-bold flex-shrink-0"
                    />
                    <span className="font-bold text-foreground flex-1">{tp.player?.name}</span>
                    <Football className="h-5 w-5 text-accent" strokeWidth={1.8} />
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

                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    Com passe de:
                  </p>

                  {otherPlayers.map((tp: any) => (
                    <button
                      key={tp.player_id}
                      onClick={() => handleRegisterGoal(tp.player_id)}
                      disabled={loading}
                      className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors text-left disabled:opacity-50"
                    >
                      <PlayerAvatar
                        name={tp.player?.name || "Jogador"}
                        avatarUrl={tp.player?.avatar_url}
                        className="w-10 h-10 rounded-full bg-background text-xs font-bold flex-shrink-0"
                      />
                      <span className="font-bold text-foreground flex-1">{tp.player?.name}</span>
                      <Target className="h-5 w-5 text-accent" strokeWidth={1.8} />
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
