import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
      }),
  );
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function payloadBytes(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function rowCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return 1;
  return 0;
}

function unwrap(result, label) {
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return result?.data ?? null;
}

const warnings = [];

function optionalUnwrap(result, label, fallback = []) {
  if (!result?.error) return result?.data ?? fallback;
  warnings.push(`${label}: ${result.error.message}`);
  return fallback;
}

async function benchmark(label, operation, { iterations, warmups }) {
  for (let index = 0; index < warmups; index += 1) await operation();
  const durations = [];
  const payloads = [];
  let rows = 0;
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const value = await operation();
    durations.push(performance.now() - startedAt);
    payloads.push(payloadBytes(value));
    rows = rowCount(value);
  }
  return {
    label,
    samples: iterations,
    p50Ms: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    maxMs: round(Math.max(...durations)),
    averagePayloadKb: round(payloads.reduce((sum, value) => sum + value, 0) / payloads.length / 1024),
    rows,
  };
}

const env = { ...loadEnv(".env.local"), ...process.env };
const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.");
}

const iterationsValue = Number(env.STRUCTURE_BENCHMARK_ITERATIONS || 20);
const warmupsValue = Number(env.STRUCTURE_BENCHMARK_WARMUPS || 3);
const iterations = Number.isInteger(iterationsValue) && iterationsValue >= 5 && iterationsValue <= 100
  ? iterationsValue
  : 20;
const warmups = Number.isInteger(warmupsValue) && warmupsValue >= 0 && warmupsValue <= 20
  ? warmupsValue
  : 3;
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const seasons = unwrap(await client.from("seasons")
  .select("id,league_id,number,status,started_at")
  .order("started_at", { ascending: false }), "seasons");
if (!seasons.length) throw new Error("Nenhuma temporada disponível para o benchmark.");

const candidates = [];
for (const season of seasons) {
  const rounds = unwrap(await client.from("rounds")
    .select("id,league_id,season_id,number,date,status,round_type")
    .eq("season_id", season.id)
    .order("date", { ascending: false }), "rounds");
  candidates.push({
    season,
    rounds,
    finishedOfficial: rounds.filter((item) => item.status === "finished" && item.round_type === "official"),
  });
}
const target = candidates.sort((a, b) => b.finishedOfficial.length - a.finishedOfficial.length)[0];
const { season } = target;
const leagueId = season.league_id;
const roundIds = target.finishedOfficial.map((round) => round.id);
const latestRoundId = roundIds[0] || target.rounds[0]?.id || null;
const playerRows = unwrap(await client.from("league_members")
  .select("player_id")
  .eq("league_id", leagueId)
  .eq("is_active", true), "league_members");
const playerIds = playerRows.map((item) => item.player_id).filter(Boolean);
const playerWithStats = roundIds.length > 0
  ? optionalUnwrap(await client.from("player_round_stats")
      .select("player_id")
      .in("round_id", roundIds)
      .gt("games", 0)
      .limit(1), "playerWithStats")
  : [];
const playerId = playerWithStats[0]?.player_id || playerIds[0] || null;
const fantasySeason = unwrap(await client.from("fantasy_seasons")
  .select("id")
  .eq("season_id", season.id)
  .maybeSingle(), "fantasy_seasons");

const operations = {
  transportBaseline: async () => unwrap(await client.from("leagues")
    .select("id")
    .eq("id", leagueId)
    .maybeSingle(), "transportBaseline"),

  homeReadModel: async () => unwrap(await client.rpc("get_home_read_model", {
    p_season_id: season.id,
    p_league_id: leagueId,
  }), "homeReadModel"),

  roster: async () => unwrap(await client.from("league_members")
    .select("player_profile,initial_player_profile,overall_traits,overall_seed_mode,players(*)")
    .eq("league_id", leagueId)
    .eq("is_active", true), "roster"),

  seasonStats: async () => unwrap(await client.from("player_season_stats")
    .select("player_id,rounds_count,games,goals,assists,wins,draws,losses,points,ranking_points")
    .eq("season_id", season.id)
    .eq("round_type", "official"), "seasonStats"),

  rankingHistory: async () => roundIds.length === 0 ? [] : unwrap(await client.from("player_round_stats")
    .select("player_id,round_id,games,wins,draws,losses,goals,assists,points,ranking_points,ranking_position_bonus,goalkeeper_games,goals_conceded,clean_sheets,player:player_id(id,name,nickname,avatar_url,player_profile,member_category,is_selectable)")
    .in("round_id", roundIds), "rankingHistory"),

  playerHistory: async () => !playerId || roundIds.length === 0 ? [] : unwrap(await client.from("player_round_stats")
    .select("id,player_id,round_id,games,wins,draws,losses,goals,assists,points,ranking_points,ranking_position_bonus,goalkeeper_games,goals_conceded,clean_sheets,rounds(number,date,scoring_snapshot)")
    .eq("player_id", playerId)
    .in("round_id", roundIds)
    .order("rounds(number)", { ascending: false }), "playerHistory"),

  callups: async () => unwrap(await client.from("callups")
    .select("id,date,start_time,stadium_id,stadium_name,round_type,capacity,waitlist_capacity,status,callup_entries(player_id,status,position),round:round_id(id,status,matches(status,started_at))")
    .eq("league_id", leagueId)
    .in("status", ["open", "locked", "converted"])
    .order("date", { ascending: true }), "callups"),

  payments: async () => {
    const [roundsResult, expensesResult, recipientsResult] = await Promise.all([
      client.from("rounds")
        .select("id,number,date,status,round_type,payment_pix,payment_total,payment_recipient_name")
        .eq("season_id", season.id)
        .order("date", { ascending: false }),
      client.from("league_expense_items")
        .select("id,name,total_amount,installment_count,status,paid_installments_before_app,installments:round_expense_installments(id,status)")
        .eq("league_id", leagueId),
      client.from("payment_recipients")
        .select("id,name,pix_type,is_active")
        .eq("league_id", leagueId),
    ]);
    return {
      rounds: unwrap(roundsResult, "payments.rounds"),
      expenses: optionalUnwrap(expensesResult, "payments.expenses"),
      recipients: optionalUnwrap(recipientsResult, "payments.recipients"),
    };
  },

  collective: async () => unwrap(await client.from("collective_messages")
    .select("id,callup_id,sender_user_id,kind,deleted_at,created_at")
    .in("callup_id", (await client.from("callups").select("id").eq("league_id", leagueId)).data?.map((item) => item.id) || [])
    .order("created_at", { ascending: false })
    .limit(200), "collective"),

  liveMatchRead: async () => unwrap(await client.from("matches")
    .select("id,score_a,score_b,status,timer_started_at,timer_accumulated_seconds,round:round_id!inner(id,number,season_id),teamA:team_a_id(id,name,position,color,crest_url),teamB:team_b_id(id,name,position,color,crest_url)")
    .eq("round.season_id", season.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(), "liveMatchRead"),

  rankingEnrichment: async () => {
    const [fitness, profiles, loadouts, overall, speed, belts] = await Promise.all([
      roundIds.length
        ? client.from("player_round_fitness").select("player_id,distance_km,average_speed_kmh").in("round_id", roundIds)
        : Promise.resolve({ data: [], error: null }),
      client.from("account_profiles").select("user_id,player_id").in("player_id", playerIds),
      client.from("account_cosmetic_loadouts").select("user_id,frame:frame_cosmetic_id(asset_key),aura:aura_cosmetic_id(asset_key),title:title_cosmetic_id(name),banner:banner_cosmetic_id(asset_key),nameplate:nameplate_cosmetic_id(asset_key),background:background_cosmetic_id(asset_key),showcase:showcase_cosmetic_id(asset_key),pitch:pitch_cosmetic_id(asset_key)"),
      client.rpc("get_latest_player_card_overalls_for_league", { p_league_id: leagueId }),
      client.rpc("get_public_player_speed_ratings_for_league", { p_league_id: leagueId }),
      client.rpc("get_league_achievement_belt_holders", { p_league_id: leagueId }),
    ]);
    return {
      fitness: optionalUnwrap(fitness, "rankingEnrichment.fitness"),
      profiles: optionalUnwrap(profiles, "rankingEnrichment.profiles"),
      loadouts: optionalUnwrap(loadouts, "rankingEnrichment.loadouts"),
      overall: optionalUnwrap(overall, "rankingEnrichment.overall"),
      speed: optionalUnwrap(speed, "rankingEnrichment.speed"),
      belts: optionalUnwrap(belts, "rankingEnrichment.belts"),
    };
  },

  fantasyDashboardCore: async () => {
    if (!fantasySeason?.id) return null;
    const [roundsResult, healthResult, marketResult] = await Promise.all([
      client.from("fantasy_rounds")
        .select("id,round_id,market_status,rules_version,settings_snapshot,round:round_id(id,number,date,start_time,status,round_type,preparation_stage,matches(id,status))")
        .eq("fantasy_season_id", fantasySeason.id),
      client.rpc("get_fantasy_market_v11_public_health", { p_fantasy_season_id: fantasySeason.id }),
      client.rpc("get_fantasy_market_read_model", { p_fantasy_season_id: fantasySeason.id }),
    ]);
    return {
      rounds: unwrap(roundsResult, "fantasyDashboardCore.rounds"),
      health: unwrap(healthResult, "fantasyDashboardCore.health"),
      market: unwrap(marketResult, "fantasyDashboardCore.market"),
    };
  },

  latestRoundPayment: async () => {
    if (!latestRoundId) return null;
    const [participants, payments, obligations, chargeLines] = await Promise.all([
      client.from("round_players").select("player_id").eq("round_id", latestRoundId),
      client.from("round_payments").select("player_id,paid,paid_at").eq("round_id", latestRoundId),
      client.from("round_payment_obligations").select("id,player_id,amount_due,amount_paid,status").eq("round_id", latestRoundId),
      client.from("round_payment_charge_lines").select("id,player_id,label,amount,charge_type").eq("round_id", latestRoundId),
    ]);
    return {
      participants: unwrap(participants, "latestRoundPayment.participants"),
      payments: unwrap(payments, "latestRoundPayment.payments"),
      obligations: optionalUnwrap(obligations, "latestRoundPayment.obligations"),
      chargeLines: optionalUnwrap(chargeLines, "latestRoundPayment.chargeLines"),
    };
  },
};

operations.rankingComposite = async () => {
  const startedSeason = await operations.seasonStats();
  const history = await operations.rankingHistory();
  const enrichments = await operations.rankingEnrichment();
  return { startedSeason, history, enrichments };
};

operations.homeComposite = async () => {
  const [home, ranking] = await Promise.all([
    operations.homeReadModel(),
    operations.rankingComposite(),
  ]);
  return { home, ranking };
};

const results = [];
const failures = [];
for (const [name, operation] of Object.entries(operations)) {
  try {
    results.push(await benchmark(name, operation, { iterations, warmups }));
  } catch (error) {
    failures.push({ name, error: error instanceof Error ? error.message : String(error) });
  }
}

results.sort((a, b) => b.p95Ms - a.p95Ms);
const report = {
  generatedAt: new Date().toISOString(),
  project: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
  transport: "Supabase JS via HTTPS/PostgREST; inclui rede e serialização",
  iterations,
  warmups,
  dataset: {
    seasons: seasons.length,
    targetSeason: season.number,
    finishedOfficialRounds: roundIds.length,
    leaguePlayers: playerIds.length,
    fantasyAvailable: Boolean(fantasySeason?.id),
  },
  results,
  failures,
  warnings: [...new Set(warnings)],
};

console.log(JSON.stringify(report, null, 2));
