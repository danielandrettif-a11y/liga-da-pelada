import { SITE_URL } from "@/lib/siteUrl";


type TimerAlert = "thirty_seconds" | "finished";

type TimerScheduleInput = {
  matchId: string;
  durationSeconds: number;
  accumulatedSeconds: number;
  startedAt: string;
};

function readEnvironmentValue(name: string) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return undefined;

  const withoutName = rawValue.startsWith(`${name}=`)
    ? rawValue.slice(name.length + 1).trim()
    : rawValue;
  const hasMatchingQuotes = (
    (withoutName.startsWith('"') && withoutName.endsWith('"'))
    || (withoutName.startsWith("'") && withoutName.endsWith("'"))
  );
  return hasMatchingQuotes ? withoutName.slice(1, -1).trim() : withoutName;
}

function getQStashPublishUrl() {
  const baseUrl = (readEnvironmentValue("QSTASH_URL") || "https://qstash.upstash.io").replace(/\/$/, "");
  return `${baseUrl}/v2/publish`;
}

function getSchedulerConfiguration() {
  const token = readEnvironmentValue("QSTASH_TOKEN");
  const webhookSecret = readEnvironmentValue("MATCH_TIMER_WEBHOOK_SECRET");
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
  const response = await fetch(`${getQStashPublishUrl()}/${destination}`, {
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
    const responseDetails = (await response.text()).trim().slice(0, 300);
    throw new Error(
      `QStash recusou o alerta ${threshold}: HTTP ${response.status}`
      + (responseDetails ? ` — ${responseDetails}` : "."),
    );
  }
}

export async function schedulePushTestAlert(userId: string) {
  const { token, webhookSecret, enabled } = getSchedulerConfiguration();
  if (!enabled || !token || !webhookSecret) {
    throw new Error("O agendador da tela bloqueada não está configurado no servidor.");
  }

  const destination = `${SITE_URL}/api/internal/push-test-alert`;
  const response = await fetch(`${getQStashPublishUrl()}/${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Delay": "10s",
      "Upstash-Retries": "3",
      "Upstash-Retry-Delay": "1000",
      "Upstash-Forward-Authorization": `Bearer ${webhookSecret}`,
      "Upstash-Label": `push-test-${userId}`,
      "Upstash-Redact-Fields": "body,header[Authorization]",
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const responseDetails = (await response.text()).trim().slice(0, 300);
    throw new Error(
      `QStash recusou o teste: HTTP ${response.status}`
      + (responseDetails ? ` — ${responseDetails}` : "."),
    );
  }

  return { scheduled: true };
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
