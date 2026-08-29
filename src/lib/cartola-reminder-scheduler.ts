import { SITE_URL } from "@/lib/siteUrl";

export type CartolaReminderMilestone = "opening" | "24h" | "12h" | "1h";

export type CartolaReminderJob = {
  roundId: string;
  milestone: CartolaReminderMilestone;
  targetAt: string;
  roundStartAt: string;
};

const MAX_DELAY_SECONDS = 6 * 24 * 60 * 60;

function env(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = raw.startsWith(`${name}=`) ? raw.slice(name.length + 1).trim() : raw;
  return value.replace(/^['"]|['"]$/g, "").trim();
}

function qstashPublishUrl() {
  const base = (env("QSTASH_URL") || "https://qstash.upstash.io").replace(/\/$/, "");
  return `${base}/v2/publish`;
}

export function roundStartIso(date: string, startTime: string) {
  const cleanTime = (startTime || "08:00").slice(0, 5);
  return new Date(`${date}T${cleanTime}:00-03:00`).toISOString();
}

export async function scheduleCartolaReminderJob(job: CartolaReminderJob) {
  const token = env("QSTASH_TOKEN");
  const webhookSecret = env("MATCH_TIMER_WEBHOOK_SECRET");
  if (!token || !webhookSecret) {
    console.warn("Lembretes do Cartola não agendados: QStash ou segredo interno ausente.");
    return { scheduled: false, disabled: true };
  }

  const targetMs = new Date(job.targetAt).getTime();
  const delaySeconds = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
  const nextRun = Math.ceil(Date.now() / 1000) + Math.min(delaySeconds, MAX_DELAY_SECONDS);
  const destination = `${SITE_URL}/api/internal/cartola-reminder`;
  const response = await fetch(`${qstashPublishUrl()}/${destination}`, {
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

export async function scheduleCartolaRoundReminders(input: {
  roundId: string;
  date: string;
  startTime: string;
  includeOpening?: boolean;
}) {
  const roundStartAt = roundStartIso(input.date, input.startTime);
  const startMs = new Date(roundStartAt).getTime();
  const targets: Array<[CartolaReminderMilestone, number]> = [
    ["24h", startMs - 24 * 60 * 60 * 1000],
    ["12h", startMs - 12 * 60 * 60 * 1000],
    ["1h", startMs - 60 * 60 * 1000],
  ];
  const jobs: CartolaReminderJob[] = [];
  if (input.includeOpening !== false) {
    jobs.push({ roundId: input.roundId, milestone: "opening", targetAt: new Date().toISOString(), roundStartAt });
  }
  for (const [milestone, targetMs] of targets) {
    if (targetMs > Date.now()) {
      jobs.push({ roundId: input.roundId, milestone, targetAt: new Date(targetMs).toISOString(), roundStartAt });
    }
  }
  const results = await Promise.allSettled(jobs.map(scheduleCartolaReminderJob));
  const rejected = results.find((item) => item.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return { scheduled: jobs.length };
}
