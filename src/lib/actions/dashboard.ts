"use server";

import { getCurrentAccount } from "../auth";
import { isDashboardCallupVisible, readDashboardCallups } from "../dashboard-callups";
import { getSelectedLeague } from "../league-context";
import { measureMatchStep } from "../match-performance";
import { homeTraceId } from "../home-performance";
import type { HomeLiveMatch } from "@/components/LiveMatchBanner";
import type { ActiveCallupData, UserCallupEntry } from "@/components/OpenCallupBanner";

type DashboardClient = Awaited<ReturnType<typeof getCurrentAccount>>["client"];
type RoundPreview = {
  id: string;
  number: number;
  date: string;
  start_time?: string | null;
  status: "draft" | "active";
  preparation_stage?: "prelist" | "teams_ready";
  stadium_id?: string | null;
  stadium_name?: string | null;
  stadium_map_url?: string | null;
  round_type: "official" | "friendly";
  participant_count: number;
};
type AgendaCallup = ActiveCallupData & {
  roundId: string | null;
  stadiumId: string | null;
  userEntry: UserCallupEntry;
};
type AgendaModel = {
  league: { stadium_name?: string | null; stadium_map_url?: string | null; event_duration_minutes?: number; match_duration?: number };
  rounds: RoundPreview[];
  callups: Array<{
    id: string;
    round_id: string | null;
    date: string;
    start_time: string | null;
    stadium_id: string | null;
    stadium_name: string | null;
    stadium_map_url: string | null;
    round_type: AgendaCallup["roundType"];
    capacity: number;
    waitlist_capacity: number;
    confirmed: number;
    waiting: number;
    userEntry: UserCallupEntry;
  }>;
  liveMatch: HomeLiveMatch | null;
};

function formatAgenda({ league, rounds, callups, liveMatch }: AgendaModel) {
  const activeCallups: AgendaCallup[] = callups.map((callup) => ({
    id: callup.id,
    roundId: callup.round_id,
    date: callup.date,
    startTime: callup.start_time || "08:00",
    stadiumId: callup.stadium_id,
    stadiumName: callup.stadium_name || league.stadium_name,
    stadiumMapUrl: callup.stadium_map_url || league.stadium_map_url,
    roundType: callup.round_type,
    capacity: callup.capacity,
    waitlistCapacity: callup.waitlist_capacity,
    confirmed: callup.confirmed,
    waiting: callup.waiting,
    userEntry: callup.userEntry,
  }));
  function nextRound(type: RoundPreview["round_type"]) {
    const round = rounds.find((candidate) => candidate.round_type === type);
    if (!round) return null;
    const callup = activeCallups.find((item) => item.roundType === type && (item.roundId === round.id || item.date === round.date));
    return { ...round, confirmedPlayers: round.participant_count || callup?.confirmed || 0 };
  }
  const official = nextRound("official");
  return {
    nextRound: official,
    nextFriendly: nextRound("friendly"),
    activeCallups,
    liveMatch,
    venue: {
      name: official?.stadium_name || league.stadium_name,
      mapUrl: official?.stadium_map_url || league.stadium_map_url,
    },
    matchDuration: league.match_duration || 7,
    eventDurationMinutes: league.event_duration_minutes || 120,
  };
}

async function readCompatibleAgenda(client: DashboardClient, leagueId: string, playerId: string | null): Promise<AgendaModel> {
  const [season, callups] = await Promise.all([
    client.from("seasons").select("id").eq("league_id", leagueId).eq("status", "active").order("id").limit(1).maybeSingle(),
    readDashboardCallups(client, leagueId),
  ]);
  if (season.error || callups.error) throw season.error || callups.error;
  const result = season.data
    ? await client.rpc("get_home_agenda_read_model", { p_season_id: season.data.id, p_league_id: leagueId })
    : await client.from("leagues").select("match_duration, stadium_name, stadium_map_url, event_duration_minutes").eq("id", leagueId).single();
  if (result.error || !result.data) throw result.error || new Error("Agenda sem dados");

  return {
    league: season.data ? result.data.league : result.data,
    rounds: [result.data.nextRound, result.data.nextFriendly].filter(Boolean).map((round) => ({
      ...round, participant_count: round.round_players?.[0]?.count || 0,
    })),
    liveMatch: result.data.liveMatch || null,
    callups: (callups.data || []).flatMap((item) => {
      const round = Array.isArray(item.round) ? item.round[0] : item.round;
      if (!isDashboardCallupVisible({ round })) return [];
      const entries = item.callup_entries || [];
      const userEntry = entries.find((entry) => entry.player_id === playerId
        && (entry.status === "confirmed" || entry.status === "waitlist"));
      return [{
        ...item,
        round_id: round?.id || null,
        confirmed: entries.filter((entry) => entry.status === "confirmed").length,
        waiting: entries.filter((entry) => entry.status === "waitlist").length,
        userEntry: userEntry ? { playerId: userEntry.player_id, status: userEntry.status as "confirmed" | "waitlist", position: userEntry.position } : null,
      }];
    }),
  };
}

export async function getHomeAgenda(trace?: string) {
  const traceId = homeTraceId(trace);
  const [account, league] = await measureMatchStep("load_home", "account_context", () =>
    Promise.all([getCurrentAccount(), getSelectedLeague()]), traceId);
  if (!account.user || !league) return null;

  const leagueId = league.id;
  async function readV2() {
    const { data, error } = await account.client.rpc("get_home_agenda_v2", { p_league_id: leagueId });
    if (error || !data?.league) throw error || new Error("Agenda sem dados");
    return data as AgendaModel;
  }

  if (process.env.HOME_AGENDA_V2_ENABLED === "true") {
    try {
      return formatAgenda(await measureMatchStep("load_home", "agenda_v2", readV2, traceId));
    } catch {
      // Durante a implantação, a função nova pode ainda não estar disponível.
    }
  }
  return formatAgenda(await measureMatchStep("load_home", "agenda_compat", () =>
    readCompatibleAgenda(account.client, league.id, account.profile?.player_id || null), traceId));
}

const MATCH_PREVIEW = "id, team_a_id, team_b_id, score_a, score_b, match_order, teamA:team_a_id(id,name,color,position,crest_url), teamB:team_b_id(id,name,color,position,crest_url)";
const PREVIEW_COUNT = 5;

async function readRoundMatchScores(client: DashboardClient, roundId: string, preview: boolean) {
  const query = client.from("matches").select(MATCH_PREVIEW, preview ? { count: "exact" } : undefined)
    .eq("round_id", roundId).order("match_order").order("id");
  const result = await (preview ? query.limit(PREVIEW_COUNT) : query);
  if (result.error) throw result.error;
  return { matches: result.data || [], totalMatches: result.count ?? result.data?.length ?? 0 };
}

export async function getHomeLastRound() {
  return measureMatchStep("load_home", "last_round_preview", async () => {
    const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
    if (!account.user || !league) return null;
    const { data: season, error: seasonError } = await account.client.from("seasons").select("id")
      .eq("league_id", league.id).eq("status", "active").order("id").limit(1).maybeSingle();
    if (seasonError) throw seasonError;
    if (!season) return null;
    const { data: round, error } = await account.client.from("rounds").select("id, number, date")
      .eq("league_id", league.id).eq("season_id", season.id).eq("round_type", "official").eq("status", "finished")
      .order("date", { ascending: false }).order("number", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!round) return null;
    return { ...round, ...await readRoundMatchScores(account.client, round.id, true) };
  });
}

async function requireFinishedHomeRound(roundId: string) {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.user || !league) throw new Error("Rodada indisponível");
  const { data, error } = await account.client.from("rounds").select("id")
    .eq("id", roundId).eq("league_id", league.id).eq("round_type", "official").eq("status", "finished").maybeSingle();
  if (error || !data) throw new Error("Rodada indisponível");
  return account.client;
}

export async function getHomeRoundMoreMatches(roundId: string) {
  return (await readRoundMatchScores(await requireFinishedHomeRound(roundId), roundId, false)).matches;
}

export async function getHomeMatchGoals(roundId: string, matchId: string) {
  const client = await requireFinishedHomeRound(roundId);
  const { data, error } = await client.from("match_events")
    .select("id,match_id,event_type,player_id,assist_player_id,team_id,minute,elapsed_seconds,player:player_id(id,name),assist_player:assist_player_id(id,name),match:match_id!inner(round_id)")
    .eq("match_id", matchId).eq("match.round_id", roundId).eq("event_type", "goal").order("created_at").order("id");
  if (error) throw new Error("Não foi possível carregar os gols.");
  return data || [];
}
