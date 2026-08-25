import { SITE_URL } from "@/lib/siteUrl";

type TimerAlert = "thirty_seconds" | "finished";

type TimerScheduleInput = {
  matchId: string;
  durationSeconds: number;
  accumulatedSeconds: number;
  startedAt: string;
};

const QSTASH_PUBLISH_URL = "https://qstash.upstash.io/v2/publish";

function getSchedulerConfiguration() {
  const token = process.env.QSTASH_TOKEN;
  const webhookSecret = process.env.MATCH_TIMER_WEBHOOK_SECRET;
  return {
    token,
    webhookSecret,
    enabled: Boolean(token && webhookSecret),
  };
}

function secondsUntil(input: TimerScheduleInput, threshold: TimerAlert) {
  const elapsedSinceStart = Math.max(
    0,
    Math.floor((Date.now() - new Date(input.startedAt).getTime()) / 1000),
  );
  const elapsedAtStart = Math.max(0, input.accumulatedSeconds + elapsedSinceStart);
  const targetElapsed = threshold === "thirty_seconds"
    ? Math.max(0, input.durationSeconds - 30)
    : input.durationSeconds;
  return Math.max(0, targetElapsed - elapsedAtStart);
}

async function scheduleTimerAlert(
  input: TimerScheduleInput,
  threshold: TimerAlert,
  token: string,
  webhookSecret: string,
) {
  const destination = `${SITE_URL}/api/internal/match-timer-alert`;
  const runAt = Math.ceil((Date.now() + secondsUntil(input, threshold) * 1000) / 1000);
  const response = await fetch(`${QSTASH_PUBLISH_URL}/${encodeURIComponent(destination)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Not-Before": String(runAt),
      "Upstash-Retries": "3",
      "Upstash-Retry-Delay": "1000",
      "Upstash-Forward-Authorization": `Bearer ${webhookSecret}`,
      "Upstash-Label": `match-timer-${threshold}-${input.matchId}`,
      "Upstash-Redact-Fields": "body,header[Authorization]",
    },
    body: JSON.stringify({ matchId: input.matchId, threshold }),
  });

  if (!response.ok) {
    throw new Error(`Não foi possível agendar o alerta ${threshold} (${response.status}).`);
  }
}

/**
 * Agenda os dois alertas em um serviço que continua rodando quando o PWA está
 * fechado ou com a tela bloqueada. Os jobs podem se repetir após pausar ou
 * acrescentar tempo: a trava no banco garante que cada alerta seja entregue
 * uma única vez, no momento em que o cronômetro realmente atingir o marco.
 */
export async function scheduleMatchTimerAlerts(input: TimerScheduleInput) {
  const { token, webhookSecret, enabled } = getSchedulerConfiguration();
  if (!enabled || !token || !webhookSecret) {
    console.warn("Agendador do cronômetro indisponível: configure QSTASH_TOKEN e MATCH_TIMER_WEBHOOK_SECRET.");
    return { scheduled: false, disabled: true };
  }

  await Promise.all([
    scheduleTimerAlert(input, "thirty_seconds", token, webhookSecret),
    scheduleTimerAlert(input, "finished", token, webhookSecret),
  ]);

  return { scheduled: true };
}
