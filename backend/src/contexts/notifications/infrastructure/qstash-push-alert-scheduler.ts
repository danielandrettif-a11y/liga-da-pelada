import type { PushAlertScheduler } from "../application/manage-delivery.js";

type SchedulerConfiguration = {
  appPublicUrl: string;
  token?: string;
  webhookSecret?: string;
  qstashUrl?: string;
};

export function qstashPushAlertScheduler(configuration: SchedulerConfiguration): PushAlertScheduler {
  return {
    async schedulePushTest(userId: string) {
      const token = configuration.token?.trim();
      const webhookSecret = configuration.webhookSecret?.trim();
      if (!token || !webhookSecret) {
        throw new Error("O agendador da tela bloqueada não está configurado no backend.");
      }

      const qstashUrl = (configuration.qstashUrl?.trim() || "https://qstash.upstash.io").replace(/\/+$/, "");
      const destination = `${configuration.appPublicUrl.replace(/\/+$/, "")}/api/internal/notifications/push-test-alert`;

      const response = await fetch(`${qstashUrl}/v2/publish/${destination}`, {
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
        const details = (await response.text()).trim().slice(0, 300);
        throw new Error(`QStash recusou o teste: HTTP ${response.status}${details ? ` — ${details}` : "."}`);
      }

      return { scheduled: true };
    },
  };
}

