export const GOAL_REGULATION_SECONDS = 7 * 60;

export type GoalTimeEvent = {
  elapsed_seconds?: number | null;
  minute?: number | null;
};

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Formata o instante oficial do gol. Registros novos usam segundos exatos;
 * os antigos continuam visíveis, mas são identificados como aproximados.
 */
export function formatGoalTime(
  event: GoalTimeEvent,
  regulationSeconds = GOAL_REGULATION_SECONDS,
) {
  const rawElapsed = event.elapsed_seconds;
  if (rawElapsed !== null && rawElapsed !== undefined && Number.isFinite(Number(rawElapsed))) {
    const elapsedSeconds = Math.max(0, Math.floor(Number(rawElapsed)));
    if (elapsedSeconds > regulationSeconds) {
      return `${formatClock(regulationSeconds)} + ${formatClock(elapsedSeconds - regulationSeconds)}`;
    }
    return formatClock(elapsedSeconds);
  }

  const rawMinute = event.minute;
  if (rawMinute === null || rawMinute === undefined || !Number.isFinite(Number(rawMinute))) {
    return null;
  }

  const minute = Math.max(0, Math.floor(Number(rawMinute)));
  const regulationMinutes = Math.floor(regulationSeconds / 60);
  if (minute > regulationMinutes) {
    return `${regulationMinutes}' + ${minute - regulationMinutes}' (aprox.)`;
  }
  return `${minute}' (aprox.)`;
}
