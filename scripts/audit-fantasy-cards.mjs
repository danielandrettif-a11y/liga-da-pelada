import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator),
          line.slice(separator + 1).replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = String(selector(item) || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

const env = loadEnv(".env.local");
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const responses = await Promise.all([
  supabase.from("fantasy_round_packs").select("id,user_id,round_id,fantasy_season_pass_reward_id,status,source,card_tier"),
  supabase.from("fantasy_pack_offers").select("pack_id,slot,card_id"),
  supabase.from("rounds").select("id,league_id"),
  supabase.from("fantasy_season_pass_rewards").select("id,fantasy_season_id"),
  supabase.from("fantasy_seasons").select("id,league_id"),
  supabase.from("fantasy_user_cards").select("id,user_id,league_id,source_pack_id,status"),
  supabase.from("fantasy_card_activations").select("id,user_id,round_id,user_card_id,status"),
]);

const joinedPackProbe = await supabase
  .from("fantasy_round_packs")
  .select("id, rounds:round_id(number,league_id), pass_reward:fantasy_season_pass_reward_id(fantasy_season_id, season:fantasy_seasons!fantasy_season_pass_rewards_fantasy_season_id_fkey(league_id))")
  .limit(1);

const errors = responses.flatMap((response) => response.error ? [response.error.message] : []);
if (errors.length) throw new Error(errors.join(" | "));

const [packs, offers, rounds, rewards, seasons, cards, activations] = responses.map(
  (response) => response.data || [],
);
const offersPerPack = new Map();
for (const offer of offers) {
  offersPerPack.set(offer.pack_id, (offersPerPack.get(offer.pack_id) || 0) + 1);
}
const roundLeague = new Map(rounds.map((round) => [round.id, round.league_id]));
const seasonLeague = new Map(seasons.map((season) => [season.id, season.league_id]));
const rewardLeague = new Map(
  rewards.map((reward) => [reward.id, seasonLeague.get(reward.fantasy_season_id)]),
);
const packLeague = (pack) => pack.round_id
  ? roundLeague.get(pack.round_id)
  : pack.fantasy_season_pass_reward_id
    ? rewardLeague.get(pack.fantasy_season_pass_reward_id)
    : null;
const cardsByPack = new Map();
for (const card of cards) {
  cardsByPack.set(card.source_pack_id, (cardsByPack.get(card.source_pack_id) || 0) + 1);
}

const report = {
  project: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
  packs: packs.length,
  packsByStatus: countBy(packs, (pack) => pack.status),
  packsBySource: countBy(packs, (pack) => pack.source),
  brokenScope: packs.filter((pack) => !packLeague(pack)).length,
  openedMissingOffers: packs.filter(
    (pack) => pack.status === "opened" && (offersPerPack.get(pack.id) || 0) < 2,
  ).length,
  availableAlreadyHasOffers: packs.filter(
    (pack) => pack.status === "available" && (offersPerPack.get(pack.id) || 0) > 0,
  ).length,
  claimedWithoutInventory: packs.filter(
    (pack) => pack.status === "claimed" && !cardsByPack.has(pack.id),
  ).length,
  cards: cards.length,
  cardsByStatus: countBy(cards, (card) => card.status),
  cardsWrongLeague: cards.filter((card) => {
    const pack = packs.find((item) => item.id === card.source_pack_id);
    return pack && packLeague(pack) !== card.league_id;
  }).length,
  activations: activations.length,
  activationsByStatus: countBy(activations, (activation) => activation.status),
  orphanActivations: activations.filter(
    (activation) => !cards.some((card) => card.id === activation.user_card_id),
  ).length,
  joinedPackQuery: joinedPackProbe.error ? joinedPackProbe.error.message : "ok",
};

console.log(JSON.stringify(report, null, 2));
