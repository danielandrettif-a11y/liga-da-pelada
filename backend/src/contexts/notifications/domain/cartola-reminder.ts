import { createHmac, timingSafeEqual } from "node:crypto";

export type CartolaReminderMilestone = "24h" | "2h";

export type CartolaReminderJob = {
  roundId: string;
  milestone: CartolaReminderMilestone;
  targetAt: string;
  roundStartAt: string;
};

export type CartolaRoundReminderContext = {
  roundId: string;
  leagueId: string;
  roundNumber: number;
  date: string;
  startTime: string;
  roundStatus: string;
  roundType: string;
  remindersEnabled: boolean;
  marketStatus: string;
  playersPerTeam: number;
  candidates: Array<{
    userId: string;
    email?: string | null;
    name: string;
    pushEnabled: boolean;
    emailEnabled: boolean;
    lineupCompleted: boolean;
  }>;
};

export function roundStartIso(date: string, startTime: string): string {
  const cleanTime = (startTime || "08:00").slice(0, 5);
  return new Date(`${date}T${cleanTime}:00-03:00`).toISOString();
}

export function buildCartolaReminderJobs(input: {
  roundId: string;
  date: string;
  startTime: string;
  nowMs?: number;
}): CartolaReminderJob[] {
  const roundStartAt = roundStartIso(input.date, input.startTime);
  const startMs = new Date(roundStartAt).getTime();
  const nowMs = input.nowMs ?? Date.now();
  const targets: Array<[CartolaReminderMilestone, number]> = [
    ["24h", startMs - 24 * 60 * 60 * 1000],
    ["2h", startMs - 2 * 60 * 60 * 1000],
  ];

  return targets.flatMap(([milestone, targetMs]) =>
    targetMs > nowMs
      ? [
          {
            roundId: input.roundId,
            milestone,
            targetAt: new Date(targetMs).toISOString(),
            roundStartAt,
          },
        ]
      : [],
  );
}

export function createCartolaUnsubscribeToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`cartola-email:${userId}`).digest("base64url");
}

export function verifyCartolaUnsubscribeToken(
  userId: string,
  token: string,
  secret: string,
): boolean {
  if (!secret || !userId || !token) return false;
  const expected = createCartolaUnsubscribeToken(userId, secret);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

