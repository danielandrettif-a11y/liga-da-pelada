import {
  buildCartolaReminderJobs,
  type CartolaReminderJob,
} from "../domain/cartola-reminder.js";
import type { CartolaReminderScheduler } from "../application/manage-cartola-reminders.js";

type SchedulerConfiguration = {
  appPublicUrl: string;
  token?: string;
  webhookSecret?: string;
  qstashUrl?: string;
};

const MAX_DELAY_SECONDS = 6 * 24 * 60 * 60;

export function qstashCartolaReminderScheduler(
  configuration: SchedulerConfiguration,
): CartolaReminderScheduler {
  const token = configuration.token?.trim();
  const webhookSecret = configuration.webhookSecret?.trim();
  const qstashUrl = (configuration.qstashUrl?.trim() || "https://qstash.upstash.io").replace(/\/+$/, "");

  async function scheduleJob(job: CartolaReminderJob) {
    if (!token || !webhookSecret) {
      return { scheduled: false, disabled: true };
    }

    const targetMs = new Date(job.targetAt).getTime();
    const delaySeconds = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
    const nextRun = Math.ceil(Date.now() / 1000) + Math.min(delaySeconds, MAX_DELAY_SECONDS);
    const destination = `${configuration.appPublicUrl.replace(/\/+$/, "")}/api/internal/notifications/cartola-reminder`;

    const response = await fetch(`${qstashUrl}/v2/publish/${destination}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(nextRun),
        "Upstash-Retries": "3",
        "Upstash-Retry-Delay": "1000",
        "Upstash-Forward-Authorization": `Bearer ${webhookSecret}`,
        "Upstash-Label": `cartola-${job.milestone}-${job.roundId}`,
        "Upstash-Redact-Fields": "body,header[Authorization]",
      },
      body: JSON.stringify(job),
    });

    if (!response.ok) {
      const detail = (await response.text()).trim().slice(0, 300);
      throw new Error(`QStash recusou o lembrete do Cartola: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
    }

    return { scheduled: true };
  }

  return {
    async scheduleReminderJob(job: CartolaReminderJob) {
      return scheduleJob(job);
    },

    async scheduleRoundReminders(input: { roundId: string; date: string; startTime: string }) {
      const jobs = buildCartolaReminderJobs(input);
      if (jobs.length === 0) return { scheduled: 0 };

      const results = await Promise.allSettled(jobs.map(scheduleJob));
      const rejected = results.find((item) => item.status === "rejected");
      if (rejected && rejected.status === "rejected") {
        throw rejected.reason;
      }
      return { scheduled: jobs.length };
    },
  };
}

