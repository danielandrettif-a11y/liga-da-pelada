import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const TEST_HOST = "dukjlpdkyngiqxffrxgc.supabase.co";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(url).host !== TEST_HOST || process.env.E2E_DATABASE_LABEL !== "DISPOSABLE"
  || process.env.E2E_ALLOW_ROUND_FORMAT_MUTATIONS !== "true") {
  throw new Error("Ensaio bloqueado: use somente o Supabase de teste com as flags E2E descartaveis.");
}
if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error("Chaves do projeto de teste ausentes.");
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
const admin = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const marker = randomUUID().slice(0, 8);
const email = `e2e-round-format-${marker}@example.invalid`;
const password = `${randomUUID()}Aa1!`;
let userId = null;
let accountPlayerId = null;
let bootstrapLeagueId = null;
let targetLeagueId = null;
const guestPlayerIds = [];
let browser = null;
let page = null;

function assert(value, message) {
  if (!value) throw new Error(message);
}
function result(value, label) {
  if (value.error) throw new Error(`${label}: ${value.error.message}`);
  return value.data;
}
async function readOne(table, columns, column, id) {
  return result(await service.from(table).select(columns).eq(column, id).single(), `Leitura ${table}`);
}
async function checkCallupUi(playersPerTeam, teamsPerRound, capacity) {
  await page.goto("http://127.0.0.1:3100/rodadas");
  await page.locator("summary").filter({ hasText: "Abrir convocação" }).click();
  const currentCallup = page.getByRole("button", { name: "Ver convocação atual" });
  if (await currentCallup.isVisible()) await currentCallup.click();
  const format = page.getByText("Formato desta convocação").locator("..");
  try {
    await format.waitFor({ timeout: 7000 });
  } catch (error) {
    console.error(`TELA /rodadas (${page.url()}): ${(await page.locator("body").innerText()).slice(0, 1800)}`);
    throw error;
  }
  const selectors = format.locator("select");
  assert(await selectors.nth(0).inputValue() === String(playersPerTeam)
    && await selectors.nth(1).inputValue() === String(teamsPerRound),
  `A tela da convocação não mostrou ${playersPerTeam}x${teamsPerRound}.`);
  assert((await format.innerText()).includes(`${capacity} vagas no total`),
    `A tela da convocação não mostrou ${capacity} vagas.`);
}
async function checkCartolaUi(expectedCount) {
  await page.goto("http://127.0.0.1:3100/cartola");
  const tab = page.getByRole("tab", { name: /Meu time/ });
  await tab.waitFor();
  assert((await tab.innerText()).includes(expectedCount),
    `O Cartola não mostrou ${expectedCount} titulares na tela.`);
}

let failure = null;
try {
  const created = result(await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: `E2E Formato ${marker}` },
  }), "Criar conta descartavel");
  userId = created.user.id;
  const profile = await readOne("account_profiles", "player_id", "user_id", userId);
  accountPlayerId = profile.player_id;
  assert(accountPlayerId, "O gatilho de cadastro nao criou o perfil E2E.");

  const bootstrap = result(await service.from("leagues").insert({
    name: `E2E Bootstrap ${marker}`, slug: `e2e-bootstrap-${marker}`,
    feature_tier: "basic", visibility: "private",
  }).select("id").single(), "Criar pelada de apoio");
  bootstrapLeagueId = bootstrap.id;
  result(await service.from("league_members").insert({
    league_id: bootstrapLeagueId, player_id: accountPlayerId,
    user_id: userId, role: "admin", is_active: true,
  }), "Vincular ADM descartavel");

  const signedIn = result(await admin.auth.signInWithPassword({ email, password }), "Login ADM E2E");
  assert(signedIn.user?.id === userId, "A conta E2E nao autenticou.");
  const targetName = `E2E Formato ${marker}`;
  targetLeagueId = result(await admin.rpc("create_league_for_admin", {
    p_name: targetName, p_tier: "complete", p_visibility: "private",
  }), "Criar pelada Completa E2E");
  console.log(`Pelada isolada criada: ${targetLeagueId}`);

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:3100/login?next=%2Flobby");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: targetName }).waitFor();
  await page.getByRole("heading", { name: targetName }).locator("../../..")
    .getByRole("button", { name: "Entrar na pelada" }).click();
  await page.waitForURL("http://127.0.0.1:3100/");
  console.log("OK: conta temporária entrou na pelada E2E pela interface móvel.");

  const guests = result(await service.from("players").insert(
    Array.from({ length: 21 }, (_, i) => ({
      name: `E2E ${marker} jogador ${i + 1}`,
      avatar_url: `https://example.invalid/e2e-${marker}.png`,
      player_profile: i < 10 ? "defensive" : "offensive",
      overall_traits: [i < 10 ? "defensive" : "offensive"],
      member_category: "player",
    })),
  ).select("id"), "Criar 21 atletas E2E");
  guestPlayerIds.push(...guests.map((item) => item.id));
  result(await service.from("league_members").insert(guestPlayerIds.map((playerId, index) => ({
    league_id: targetLeagueId, player_id: playerId, role: "player", is_active: true,
    player_profile: index < 10 ? "defensive" : "offensive",
    overall_traits: [index < 10 ? "defensive" : "offensive"],
  }))), "Vincular atletas E2E");

  const callup = result(await admin.from("callups").insert({
    league_id: targetLeagueId, date: "2027-01-12", start_time: "20:00",
    round_type: "official", status: "open", capacity: 21,
    players_per_team: 7, teams_per_round: 3,
  }).select("id").single(), "Abrir convocacao 7x3");
  const roundId = result(await admin.rpc("save_round_prelist", {
    p_league_id: targetLeagueId, p_round_id: null,
    p_date: "2027-01-12", p_start_time: "20:00", p_round_type: "official",
    p_player_ids: [], p_callup_id: callup.id,
  }), "Criar pre-lista e Cartola");
  let round = await readOne("rounds", "target_players_per_team,target_teams_per_round", "id", roundId);
  let fantasy = await readOne("fantasy_rounds", "id,settings_snapshot,market_status", "round_id", roundId);
  assert(round.target_players_per_team === 7 && round.target_teams_per_round === 3,
    "A rodada nao herdou 7x3 da convocacao.");
  assert(Number(fantasy.settings_snapshot.players_per_team) === 7,
    "O Cartola nao congelou 7 titulares ao abrir a rodada.");
  await checkCallupUi(7, 3, 21);
  await checkCartolaUi("0/7");
  console.log("OK: convocacao 7x3, rodada 7x3 e Cartola com 7 titulares.");

  result(await service.from("callup_entries").insert(guestPlayerIds.map((playerId, index) => ({
    callup_id: callup.id, player_id: playerId, status: "confirmed", position: index + 1,
  }))), "Confirmar 21 atletas");
  const confirmed = result(await service.from("callup_entries")
    .select("id", { count: "exact" }).eq("callup_id", callup.id).eq("status", "confirmed"),
  "Conferir lotacao");
  assert(confirmed.length === 21, "A convocacao nao comportou 21 atletas.");
  await page.goto(`http://127.0.0.1:3100/admin/rodada?round=${roundId}&mount=1`);
  await page.getByRole("heading", { name: "Montar times" }).waitFor();
  assert(((await page.locator("body").innerText()).match(/0\/7 jogadores/g) || []).length === 3,
    "A montagem da rodada não exibiu três times com sete vagas.");
  const blockedReduction = await admin.rpc("set_callup_format", {
    p_callup_id: callup.id, p_players_per_team: 6, p_teams_per_round: 3,
  });
  assert(blockedReduction.error, "O banco aceitou 18 vagas com 21 confirmados.");
  console.log("OK: 21 confirmados ocupam as vagas; reducao indevida bloqueada.");

  result(await service.from("callup_entries").delete().eq("callup_id", callup.id)
    .in("player_id", guestPlayerIds.slice(-3)), "Remover tres confirmados E2E");
  await checkCallupUi(7, 3, 21);
  const formatControl = page.getByText("Formato desta convocação").locator("..");
  await formatControl.locator("select").first().selectOption("6");
  await formatControl.getByRole("button", { name: "Aplicar formato" }).click();
  await page.getByText("Formato atualizado: 3 times de 6.", { exact: false }).waitFor();
  const reduced = await readOne("callups", "players_per_team,teams_per_round,capacity", "id", callup.id);
  round = await readOne("rounds", "target_players_per_team,target_teams_per_round", "id", roundId);
  fantasy = await readOne("fantasy_rounds", "id,settings_snapshot", "round_id", roundId);
  console.log("Formato apos botao ADM:", JSON.stringify({ callup: reduced, round, fantasySize: fantasy.settings_snapshot.players_per_team }));
  assert(round.target_players_per_team === 6 && Number(fantasy.settings_snapshot.players_per_team) === 6,
    "A reducao para 6x3 nao sincronizou rodada e Cartola.");
  assert(reduced.players_per_team === 6 && reduced.teams_per_round === 3 && reduced.capacity === 18,
    "O botão do ADM não gravou o novo formato.");
  await checkCallupUi(6, 3, 18);
  await checkCartolaUi("0/6");
  await page.goto(`http://127.0.0.1:3100/admin/rodada?round=${roundId}&mount=1`);
  await page.getByRole("heading", { name: "Montar times" }).waitFor();
  assert(((await page.locator("body").innerText()).match(/0\/6 jogadores/g) || []).length === 3,
    "A montagem da rodada não exibiu três times com seis vagas.");
  console.log("OK: com 18 confirmados, convocacao, rodada e Cartola mudam para 6x3.");

  result(await admin.rpc("set_callup_format", {
    p_callup_id: callup.id, p_players_per_team: 7, p_teams_per_round: 3,
  }), "Restaurar 7x3");
  fantasy = await readOne("fantasy_rounds", "id,settings_snapshot", "round_id", roundId);
  assert(Number(fantasy.settings_snapshot.players_per_team) === 7,
    "A restauracao para 7x3 nao atualizou o Cartola vazio.");

  const sevenPlayerIds = guestPlayerIds.slice(0, 7);
  const sevenSlots = ["GOL", "DEF", "DEF", "DEF", "ATA", "ATA", "ATA"]
    .map((slot_role, slot_index) => ({
      player_id: sevenPlayerIds[slot_index], slot_index, slot_role,
    }));
  const lineupArgs = {
    p_round_id: roundId,
    p_player_ids: sevenPlayerIds,
    p_captain_player_id: sevenPlayerIds[4],
    p_top_scorer_player_id: null,
    p_top_assist_player_id: null,
    p_challenge_player_id: null,
    p_lineup_slots: sevenSlots,
    p_reserve_player_id: null,
    p_reserve_slot_role: null,
  };
  const shortLineup = await admin.rpc("save_fantasy_lineup_with_reserve", {
    ...lineupArgs, p_player_ids: sevenPlayerIds.slice(0, 6),
    p_lineup_slots: sevenSlots.slice(0, 6),
  });
  assert(shortLineup.error, "O Cartola aceitou seis titulares numa rodada de sete.");
  result(await admin.rpc("save_fantasy_lineup_with_reserve", lineupArgs),
    "Salvar escalação real de sete titulares");
  const lineup = await readOne("fantasy_lineups", "id", "fantasy_round_id", fantasy.id);
  const lineupPlayers = result(await service.from("fantasy_lineup_players")
    .select("player_id,slot_role").eq("lineup_id", lineup.id), "Conferir titulares gravados");
  assert(lineupPlayers.length === 7, "A escalação E2E nao gravou sete titulares.");
  await checkCartolaUi("7/7");
  console.log("OK: seis titulares rejeitados; sete titulares salvos pelo fluxo real.");
  const preserved = result(await admin.rpc("set_callup_format", {
    p_callup_id: callup.id, p_players_per_team: 6, p_teams_per_round: 3,
  }), "Reduzir apos salvar escalação");
  fantasy = await readOne("fantasy_rounds", "settings_snapshot", "round_id", roundId);
  round = await readOne("rounds", "target_players_per_team,target_teams_per_round", "id", roundId);
  const effectiveSize = result(await admin.rpc("fantasy_lineup_size", { p_round_id: roundId }),
    "Consultar tamanho do Cartola");
  assert(round.target_players_per_team === 6 && Number(fantasy.settings_snapshot.players_per_team) === 7
    && effectiveSize === 7 && preserved[0]?.fantasy_size_preserved === true,
  "A escalação salva nao conservou sete vagas quando a partida passou a 6x3.");
  await checkCallupUi(6, 3, 18);
  await checkCartolaUi("7/7");
  console.log("OK: rodada física 6x3; escalação salva mantém 7 vagas no Cartola.");

  console.log("OK: o tamanho do Cartola continua sete apos mudar a pelada para 6x3.");
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close();
  const cleanupErrors = [];
  for (const id of [targetLeagueId, bootstrapLeagueId]) {
    if (!id) continue;
    const { error } = await service.from("leagues").delete().eq("id", id);
    if (error) cleanupErrors.push(`pelada ${id}: ${error.message}`);
  }
  if (guestPlayerIds.length) {
    const { error } = await service.from("players").delete().in("id", guestPlayerIds);
    if (error) cleanupErrors.push(`atletas convidados: ${error.message}`);
  }
  if (userId) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) cleanupErrors.push(`conta ${userId}: ${error.message}`);
  }
  if (accountPlayerId) {
    const { error } = await service.from("players").delete().eq("id", accountPlayerId);
    if (error) cleanupErrors.push(`perfil ${accountPlayerId}: ${error.message}`);
  }
  await admin.auth.signOut();
  if (cleanupErrors.length) {
    console.error("LIMPEZA PENDENTE: " + cleanupErrors.join(" | "));
    process.exitCode = 1;
  } else {
    console.log("Dados E2E temporarios removidos.");
  }
}
if (failure) throw failure;
