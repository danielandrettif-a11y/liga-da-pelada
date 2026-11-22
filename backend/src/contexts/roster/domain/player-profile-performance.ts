export type PlayerPlaytime = {
  totalSeconds: number;
  officialSeconds: number;
  friendlySeconds: number;
};

export type MatchParticipation = {
  enteredElapsedSeconds: number;
  leftElapsedSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  timerStartedAt: string | null;
  timerAccumulatedSeconds: number;
  roundType: "official" | "friendly";
};

export type ClubGoalEvent = {
  teamId: string;
  teamName: string;
  teamColor: string;
  crestUrl: string | null;
  roundType: "official" | "friendly";
};

export type PlayerClubGoals = {
  key: string;
  name: string;
  color: string;
  crestUrl: string | null;
  officialGoals: number;
  friendlyGoals: number;
  totalGoals: number;
};

const teamPresets = new Map([
  ["/team-crests/meia-boca-juniors.webp", { name: "Meia Boca Juniors", color: "#FACC15" }],
  ["/team-crests/patetico-de-madrid.webp", { name: "Patético de Madrid", color: "#F43F5E" }],
  ["/team-crests/milamb.webp", { name: "MilamB", color: "#DC2626" }],
  ["/team-crests/inter-de-meiao.webp", { name: "Inter de Meião", color: "#2563EB" }],
]);

function elapsedSeconds(participation: MatchParticipation, nowMs: number): number {
  const accumulated = Math.max(0, Number(participation.timerAccumulatedSeconds || 0));
  if (participation.timerStartedAt) {
    const started = new Date(participation.timerStartedAt).getTime();
    return Number.isFinite(started) ? accumulated + Math.max(0, Math.floor((nowMs - started) / 1000)) : accumulated;
  }
  if (accumulated > 0) return accumulated;
  if (participation.startedAt && participation.finishedAt) {
    const started = new Date(participation.startedAt).getTime();
    const finished = new Date(participation.finishedAt).getTime();
    return Number.isFinite(started) && Number.isFinite(finished)
      ? Math.max(0, Math.floor((finished - started) / 1000)) : 0;
  }
  return 0;
}

export function totalPlayerPlaytime(
  participations: readonly MatchParticipation[],
  now: Date = new Date(),
): PlayerPlaytime {
  const totals: PlayerPlaytime = { totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 };
  for (const participation of participations) {
    if (!participation.startedAt) continue;
    const elapsed = elapsedSeconds(participation, now.getTime());
    const entered = Math.max(0, Number(participation.enteredElapsedSeconds || 0));
    const left = participation.leftElapsedSeconds === null
      ? elapsed : Math.max(entered, Number(participation.leftElapsedSeconds));
    const played = Math.max(0, left - entered);
    if (participation.roundType === "friendly") totals.friendlySeconds += played;
    else totals.officialSeconds += played;
    totals.totalSeconds += played;
  }
  return totals;
}

export function goalsByClub(events: readonly ClubGoalEvent[]): PlayerClubGoals[] {
  const clubs = new Map<string, PlayerClubGoals>();
  for (const event of events) {
    const preset = event.crestUrl ? teamPresets.get(event.crestUrl) : undefined;
    const key = event.crestUrl || `legacy:${event.teamName.toLocaleLowerCase("pt-BR")}:${event.teamColor}`;
    const current = clubs.get(key) || {
      key,
      name: preset?.name || event.teamName,
      color: preset?.color || event.teamColor,
      crestUrl: event.crestUrl,
      officialGoals: 0,
      friendlyGoals: 0,
      totalGoals: 0,
    };
    if (event.roundType === "friendly") current.friendlyGoals += 1;
    else current.officialGoals += 1;
    current.totalGoals += 1;
    clubs.set(key, current);
  }
  return [...clubs.values()].sort(
    (left, right) => right.totalGoals - left.totalGoals || left.name.localeCompare(right.name, "pt-BR"),
  );
}
