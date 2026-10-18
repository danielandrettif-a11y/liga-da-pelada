import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_PLAYER_EMAIL",
  "E2E_PLAYER_PASSWORD",
];

for (const key of required) {
  if (!process.env[key]) throw new Error("Configure " + key + " para executar o ensaio.");
}
if (process.env.E2E_ALLOW_MULTI_LEAGUE_MUTATIONS !== "true"
  || process.env.E2E_DATABASE_LABEL !== "DISPOSABLE") {
  throw new Error(
    "Ensaio bloqueado. Use somente uma base descartavel e configure "
    + "E2E_ALLOW_MULTI_LEAGUE_MUTATIONS=true e E2E_DATABASE_LABEL=DISPOSABLE.",
  );
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, anonKey, options);
const player = createClient(url, anonKey, options);
const suffix = randomUUID().slice(0, 8);
const created = [];
const createdRounds = [];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function rows(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message);
  return result.data || [];
}

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(label + ": " + (error?.message || "conta ausente"));
  return data.user;
}

async function createLeague(name, tier, visibility) {
  const { data, error } = await admin.rpc("create_league_for_admin", {
    p_name: name, p_tier: tier, p_visibility: visibility,
  });
  if (error || !data) throw new Error("Criacao de " + name + ": " + (error?.message || "sem ID"));
  created.push({ id: String(data), name });
  return String(data);
}

async function cleanup() {
  const failures = [];
  for (const roundId of [...createdRounds].reverse()) {
    const { error } = await admin.from("rounds").delete().eq("id", roundId);
    if (error) failures.push("Rodada " + roundId + ": " + error.message);
  }
  for (const league of [...created].reverse()) {
    const { error } = await admin.rpc("delete_league_permanently", {
      p_league_id: league.id, p_confirm_name: league.name,
    });
    if (error) failures.push(league.name + ": " + error.message);
  }
  return failures;
}

await signIn(
  admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, "Login ADM",
);
const playerUser = await signIn(
  player, process.env.E2E_PLAYER_EMAIL, process.env.E2E_PLAYER_PASSWORD, "Login jogador",
);

let testError = null;
let cleanupFailures = [];
try {
  const basicName = "E2E Basica " + suffix;
  const completeName = "E2E Completa " + suffix;
  const basicId = await createLeague(basicName, "basic", "open");
  const completeId = await createLeague(completeName, "complete", "private");

  const leagues = rows(await admin.from("leagues")
    .select("id,name,feature_tier,visibility").in("id", [basicId, completeId]), "Ligas");
  check(leagues.length === 2, "O ADM nao enxerga as duas peladas criadas.");
  check(leagues.some((item) => item.id === basicId
    && item.feature_tier === "basic" && item.visibility === "open"),
  "A pelada Basica nasceu com configuracao incorreta.");
  check(leagues.some((item) => item.id === completeId
    && item.feature_tier === "complete" && item.visibility === "private"),
  "A pelada Completa nasceu com configuracao incorreta.");

  const seasons = rows(await admin.from("seasons")
    .select("id,league_id,number,status").in("league_id", [basicId, completeId]), "Temporadas");
  check(seasons.length === 2 && seasons.every((item) => item.number === 1
    && item.status === "active"), "Cada pelada deve nascer apenas com a Temporada 1 ativa.");

  const settings = rows(await admin.from("fantasy_settings")
    .select("league_id").in("league_id", [basicId, completeId]), "Configuracoes Cartola");
  check(settings.length === 1 && settings[0].league_id === completeId,
    "Somente a pelada Completa deve nascer com Cartola.");

  const basicInvite = await admin.rpc("get_league_invite", { p_league_id: basicId });
  const completeInvite = await admin.rpc("get_league_invite", { p_league_id: completeId });
  if (basicInvite.error || completeInvite.error) {
    throw new Error("Convites: " + (basicInvite.error?.message || completeInvite.error?.message));
  }
  check(Boolean(basicInvite.data) && Boolean(completeInvite.data)
    && basicInvite.data !== completeInvite.data, "Cada pelada deve ter convite proprio.");

  const discovery = rows(await player.rpc("find_open_leagues", {
    p_query: suffix,
  }), "Descoberta");
  check(discovery.some((item) => item.league_id === basicId),
    "A pelada aberta nao apareceu na descoberta.");
  check(!discovery.some((item) => item.league_id === completeId),
    "A pelada privada apareceu na descoberta.");

  const privateJoin = await player.rpc("join_open_league", { p_league_id: completeId });
  check(Boolean(privateJoin.error), "Um jogador conseguiu entrar na pelada privada pela vitrine.");
  const openJoin = await player.rpc("join_open_league", { p_league_id: basicId });
  if (openJoin.error) throw new Error("Entrada na pelada aberta: " + openJoin.error.message);

  const visibleLeagues = rows(await player.from("leagues")
    .select("id").in("id", [basicId, completeId]), "RLS de ligas");
  check(visibleLeagues.length === 1 && visibleLeagues[0].id === basicId,
    "O jogador leu uma pelada da qual nao participa.");
  const hiddenSeason = rows(await player.from("seasons")
    .select("id").eq("league_id", completeId), "RLS de temporadas");
  check(hiddenSeason.length === 0, "O jogador leu a temporada da pelada privada.");
  const hiddenFantasy = rows(await player.from("fantasy_settings")
    .select("league_id").eq("league_id", completeId), "RLS do Cartola");
  check(hiddenFantasy.length === 0, "O jogador leu o Cartola de outra pelada.");

  const profileRows = rows(await player.from("account_profiles")
    .select("player_id").eq("user_id", playerUser.id).limit(1), "Perfil do jogador");
  check(profileRows.length === 1 && profileRows[0].player_id,
    "A conta de teste nao possui perfil de jogador.");
  const playerId = profileRows[0].player_id;

  const deactivate = await admin.from("league_members").update({
    role: "admin", is_active: false, is_favorite: true,
  }).eq("league_id", basicId).eq("player_id", playerId).select("id");
  if (deactivate.error || deactivate.data?.length !== 1) {
    throw new Error("Preparacao da reentrada: "
      + (deactivate.error?.message || "vinculo ausente"));
  }
  const reentry = await player.rpc("join_open_league", { p_league_id: basicId });
  if (reentry.error) throw new Error("Reentrada: " + reentry.error.message);
  const membership = rows(await player.from("league_members")
    .select("role,is_active,is_favorite")
    .eq("league_id", basicId).eq("player_id", playerId), "Vinculo reativado");
  check(membership.length === 1 && membership[0].role === "player"
    && membership[0].is_active === true && membership[0].is_favorite === false,
  "A reentrada restaurou papel ou favorito antigos.");

  // A RPC de disponibilidade usa a liga da rodada, nao o antigo papel global.
  // Um jogador inexistente faz a chamada parar antes de qualquer UPDATE.
  const basicSeason = seasons.find((item) => item.league_id === basicId);
  const { data: authRound, error: roundError } = await admin.from("rounds").insert({
    league_id: basicId,
    season_id: basicSeason.id,
    number: 1,
    date: "2099-01-01",
    round_type: "friendly",
  }).select("id").single();
  if (roundError || !authRound) {
    throw new Error("Rodada de autorizacao: " + (roundError?.message || "sem ID"));
  }
  createdRounds.push(authRound.id);
  const missingPlayerId = randomUUID();
  const availabilityArgs = {
    p_round_id: authRound.id,
    p_player_id: missingPlayerId,
    p_status: "available",
  };
  const playerAvailability = await player.rpc("set_round_player_availability", availabilityArgs);
  check(Boolean(playerAvailability.error)
    && playerAvailability.error.message.includes("Somente administradores desta pelada"),
  "Jogador comum conseguiu passar pela autorizacao da RPC de disponibilidade.");

  const promote = await admin.from("league_members").update({ role: "admin" })
    .eq("league_id", basicId).eq("player_id", playerId).select("id");
  if (promote.error || promote.data?.length !== 1) {
    throw new Error("Promocao do ADM da pelada: "
      + (promote.error?.message || "vinculo ausente"));
  }
  const leagueAdminAvailability = await player.rpc(
    "set_round_player_availability", availabilityArgs,
  );
  check(Boolean(leagueAdminAvailability.error)
    && leagueAdminAvailability.error.message.includes("Jogador nao encontrado nesta rodada"),
  "ADM da pelada sem papel global nao passou pela autorizacao da RPC.");

  const completeSeason = seasons.find((item) => item.league_id === completeId);
  const { data: otherRound, error: otherRoundError } = await admin.from("rounds").insert({
    league_id: completeId,
    season_id: completeSeason.id,
    number: 1,
    date: "2099-01-02",
    round_type: "friendly",
  }).select("id").single();
  if (otherRoundError || !otherRound) {
    throw new Error("Rodada da outra pelada: "
      + (otherRoundError?.message || "sem ID"));
  }
  createdRounds.push(otherRound.id);
  const crossLeagueAvailability = await player.rpc("set_round_player_availability", {
    ...availabilityArgs,
    p_round_id: otherRound.id,
  });
  check(Boolean(crossLeagueAvailability.error)
    && crossLeagueAvailability.error.message.includes("Somente administradores desta pelada"),
    "ADM de uma pelada passou pela autorizacao de outra pelada.");

  const crossFavorite = await player.rpc("toggle_league_favorite", {
    p_league_id: completeId,
  });
  check(Boolean(crossFavorite.error),
    "O jogador alterou favorito em uma pelada da qual nao participa.");

} catch (error) {
  testError = error;
} finally {
  cleanupFailures = await cleanup();
  await Promise.all([admin.auth.signOut(), player.auth.signOut()]);
}

if (testError) throw testError;
if (cleanupFailures.length) {
  throw new Error("O ensaio passou, mas a limpeza falhou: " + cleanupFailures.join(" | "));
}
console.log("OK: peladas isoladas, reentrada e autorizacao da RPC por pelada.");
