import type { MatchTimerScheduler } from "../application/manage-matches.js";

type SchedulerConfiguration = {
  appPublicUrl: string;
  token?: string;
  webhookSecret?: string;
  qstashUrl?: string;
};

type Threshold = "one_minute" | "thirty_seconds" | "finished";

function secondsUntil(input: Parameters<MatchTimerScheduler["schedule"]>[0], threshold: Threshold) {
  const running = Math.max(0, Math.floor((Date.now() - new Date(input.startedAt).getTime()) / 1000));
  const elapsed = Math.max(0, input.accumulatedSeconds + running);
  const target = threshold === "one_minute"
    ? Math.max(0, input.durationSeconds - 60)
    : threshold === "thirty_seconds"
      ? Math.max(0, input.durationSeconds - 30)
      : input.durationSeconds;
  return Math.max(0, target - elapsed - 4);
}

export function qstashMatchTimerScheduler(configuration: SchedulerConfiguration): MatchTimerScheduler {
  return {
    async schedule(input) {
      const token = configuration.token?.trim();
      const webhookSecret = configuration.webhookSecret?.trim();
      if (!token || !webhookSecret) {
        throw new Error("O agendador da tela bloqueada não está configurado no backend.");
      }
      const qstashUrl = (configuration.qstashUrl?.trim() || "https://qstash.upstash.io").replace(/\/+$/, "");
      const destination = `${configuration.appPublicUrl.replace(/\/+$/, "")}/api/internal/match-timer-alert`;
      await Promise.all((["one_minute", "thirty_seconds", "finished"] as const).map(async (threshold) => {
        const runAt = Math.ceil((Date.now() + secondsUntil(input, threshold) * 1000) / 1000);
        const response = await fetch(`${qstashUrl}/v2/publish/${destination}`, {
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
          const details = (await response.text()).trim().slice(0, 300);
          throw new Error(`QStash recusou o alerta ${threshold}: HTTP ${response.status}${details ? ` — ${details}` : "."}`);
        }
      }));
    },
  };
}
