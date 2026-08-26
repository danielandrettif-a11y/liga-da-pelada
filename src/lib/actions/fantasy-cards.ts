"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount, getAdminClient } from "@/lib/auth";
import { FANTASY_CARDS_CATALOG, getCardBySlug, type FantasyCardDefinition } from "@/lib/fantasy/cards/catalog";
import { generatePackOffers } from "@/lib/fantasy/cards/pack-generator";
import { MAX_SPECIAL_CARDS_PER_ROUND, type FantasyCardRarity } from "@/lib/fantasy/cards/config";
import { isFantasyPriceEligible } from "@/lib/fantasy/cards/eligibility";

export type FantasyPackDTO = {
  id: string;
  roundId: string | null;
  roundNumber?: number;
  source?: string;
  cardTier?: "bronze" | "gold" | null;
  status: "available" | "opened" | "claimed" | "dismissed";
  openedAt: string | null;
  chosenCardId: string | null;
  createdAt: string;
  offers: Array<{
    slot: number;
    card: FantasyCardDefinition;
  }>;
};

export type FantasyUserCardDTO = {
  id: string;
  cardId: string;
  slug: string;
  name: string;
  description: string;
  rarity: FantasyCardRarity;
  effectType: string;
  effectConfig: Record<string, any>;
  status: "OWNED" | "RESERVED" | "LOCKED" | "CONSUMED";
  acquiredAt: string;
  consumedAt: string | null;
  icon: string;
};

export type FantasyActiveCardDTO = {
  id: string;
  roundId: string;
  userCardId: string;
  card: FantasyCardDefinition;
  status: "RESERVED" | "LOCKED" | "RESOLVED";
  targetPlayerId?: string | null;
  targetPlayerName?: string | null;
  targetPlayer2Id?: string | null;
  targetPlayer2Name?: string | null;
  targetPrediction?: "TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE" | null;
  resultBonus?: number;
  resultDetails?: any;
};

/**
 * Busca todos os pacotes do usuário logado (pendentes e concluídos).
 */
export async function getMyPacks(): Promise<{
  availablePacks: FantasyPackDTO[];
  claimedCount: number;
  totalPacks: number;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { availablePacks: [], claimedCount: 0, totalPacks: 0 };

  const { data: packs } = await account.client
    .from("fantasy_round_packs")
    .select(
      "id, round_id, status, opened_at, chosen_card_id, created_at, source, card_tier, rounds:round_id(number), offers:fantasy_pack_offers(slot, card:fantasy_cards(*))"
    )
    .eq("user_id", account.user.id)
    .order("created_at", { ascending: false });

  if (!packs) return { availablePacks: [], claimedCount: 0, totalPacks: 0 };

  const formatted: FantasyPackDTO[] = packs.map((p: any) => ({
    id: p.id,
    roundId: p.round_id,
    roundNumber: p.rounds?.number,
    source: p.source,
    cardTier: p.card_tier,
    status: p.status,
    openedAt: p.opened_at,
    chosenCardId: p.chosen_card_id,
    createdAt: p.created_at,
    offers: (p.offers || []).map((off: any) => {
      const cardDef = off.card ? getCardBySlug(off.card.slug) : null;
      return {
        slot: off.slot,
        card: cardDef || {
          slug: off.card?.slug || "unknown",
          name: off.card?.name || "Carta",
          description: off.card?.description || "",
          rarity: off.card?.rarity || "COMMON",
          effectType: off.card?.effect_type || "NONE",
          effectConfig: off.card?.effect_config || {},
          enabled: true,
          icon: "🃏",
          requiresTarget: "NONE",
        },
      };
    }),
  }));

  const availablePacks = formatted.filter((p) => p.status === "available" || p.status === "opened");
  const claimedCount = formatted.filter((p) => p.status === "claimed").length;

  return {
    availablePacks,
    claimedCount,
    totalPacks: formatted.filter((p) => p.status !== "dismissed").length,
  };
}

/**
 * Abre um pacote pela primeira vez ou retorna as ofertas já existentes (Idempotente).
 */
export async function openPack(packId: string): Promise<{
  success: boolean;
  offers?: [FantasyCardDefinition, FantasyCardDefinition];
  error?: string;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = account.client;

  // Buscar pacote
  const { data: pack, error: packErr } = await client
    .from("fantasy_round_packs")
    .select("id, user_id, status, card_tier, offers:fantasy_pack_offers(slot, card:fantasy_cards(*))")
    .eq("id", packId)
    .single();

  if (packErr || !pack || pack.user_id !== account.user.id) {
    return { success: false, error: "Pacote não encontrado ou não pertence a você." };
  }

  if (pack.status === "claimed") {
    return { success: false, error: "Este pacote já foi resgatado." };
  }

  // Se já tiver ofertas salvas, retorna as mesmas (Idempotência estrita)
  if (pack.offers && pack.offers.length >= 2) {
    const sorted = [...pack.offers].sort((a: any, b: any) => a.slot - b.slot);
    const card1Obj = Array.isArray(sorted[0].card) ? sorted[0].card[0] : sorted[0].card;
    const card2Obj = Array.isArray(sorted[1].card) ? sorted[1].card[0] : sorted[1].card;
    const c1 = getCardBySlug(card1Obj?.slug)!;
    const c2 = getCardBySlug(card2Obj?.slug)!;
    return { success: true, offers: [c1, c2] };
  }

  // Sorteio server-side de 2 opções distintas
  const [offer1, offer2] = generatePackOffers(undefined, Math.random, pack.card_tier as "bronze" | "gold" | null);

  // Buscar IDs no banco
  const { data: dbCards } = await client
    .from("fantasy_cards")
    .select("id, slug")
    .in("slug", [offer1.slug, offer2.slug]);

  const cardMap = new Map((dbCards || []).map((c: any) => [c.slug, c.id]));
  const id1 = cardMap.get(offer1.slug);
  const id2 = cardMap.get(offer2.slug);

  if (!id1 || !id2) {
    return { success: false, error: "Cartas não encontradas no catálogo do banco." };
  }

  // Gravação atômica das 2 ofertas
  const { error: insErr } = await client.from("fantasy_pack_offers").insert([
    { pack_id: packId, slot: 1, card_id: id1 },
    { pack_id: packId, slot: 2, card_id: id2 },
  ]);

  if (insErr) {
    // Se falhou por conflito de concorrência, busca as que foram gravadas
    const { data: existingOffers } = await client
      .from("fantasy_pack_offers")
      .select("slot, card:fantasy_cards(*)")
      .eq("pack_id", packId);
    if (existingOffers && existingOffers.length >= 2) {
      const sorted = [...existingOffers].sort((a: any, b: any) => a.slot - b.slot);
      const ex1 = Array.isArray(sorted[0].card) ? sorted[0].card[0] : sorted[0].card;
      const ex2 = Array.isArray(sorted[1].card) ? sorted[1].card[0] : sorted[1].card;
      return {
        success: true,
        offers: [getCardBySlug(ex1?.slug)!, getCardBySlug(ex2?.slug)!],
      };
    }
    return { success: false, error: `Erro ao gerar ofertas: ${insErr.message}` };
  }

  // Marcar pacote como aberto
  await client
    .from("fantasy_round_packs")
    .update({ status: "opened", opened_at: new Date().toISOString() })
    .eq("id", packId);

  revalidatePath("/cartola");
  return { success: true, offers: [offer1, offer2] };
}

/**
 * Escolhe 1 entre as 2 cartas oferecidas (Definitivo e Atômico).
 */
export async function claimPackCard(
  packId: string,
  chosenSlug: string
): Promise<{ success: boolean; error?: string; chosenCard?: FantasyCardDefinition }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = account.client;

  // Buscar pacote e ofertas
  const { data: pack, error: packErr } = await client
    .from("fantasy_round_packs")
    .select("id, user_id, status, offers:fantasy_pack_offers(slot, card:fantasy_cards(*))")
    .eq("id", packId)
    .single();

  if (packErr || !pack || pack.user_id !== account.user.id) {
    return { success: false, error: "Pacote inválido." };
  }

  if (pack.status === "claimed") {
    return { success: false, error: "Este pacote já foi resgatado." };
  }

  const validOffer = (pack.offers || []).find((off: any) => {
    const cardObj = Array.isArray(off.card) ? off.card[0] : off.card;
    return cardObj?.slug === chosenSlug;
  });
  if (!validOffer) {
    return { success: false, error: "A carta escolhida não pertence às opções sorteadas deste pacote." };
  }

  const validCardObj = Array.isArray(validOffer.card) ? validOffer.card[0] : validOffer.card;
  const cardId = validCardObj?.id;
  const chosenDef = getCardBySlug(chosenSlug);

  // Inserir no inventário pessoal do usuário
  const { error: invErr } = await client.from("fantasy_user_cards").insert({
    user_id: account.user.id,
    card_id: cardId,
    source_pack_id: packId,
    status: "OWNED",
  });

  if (invErr) {
    return { success: false, error: `Erro ao adicionar ao inventário: ${invErr.message}` };
  }

  // Marcar pacote como claimed
  await client
    .from("fantasy_round_packs")
    .update({
      status: "claimed",
      chosen_card_id: cardId,
    })
    .eq("id", packId);

  revalidatePath("/cartola");
  return { success: true, chosenCard: chosenDef };
}

/**
 * Busca o inventário pessoal de cartas do usuário autenticado.
 */
export async function getMyInventory(): Promise<{
  cards: FantasyUserCardDTO[];
  groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  availableCount: number;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { cards: [], groupedBySlug: {}, availableCount: 0 };

  const { data } = await account.client
    .from("fantasy_user_cards")
    .select("id, card_id, status, acquired_at, consumed_at, card:fantasy_cards(*)")
    .eq("user_id", account.user.id)
    .order("acquired_at", { ascending: false });

  if (!data) return { cards: [], groupedBySlug: {}, availableCount: 0 };

  const cards: FantasyUserCardDTO[] = data.map((item: any) => {
    const cardObj = Array.isArray(item.card) ? item.card[0] : item.card;
    const cardDef = getCardBySlug(cardObj?.slug);
    return {
      id: item.id,
      cardId: item.card_id,
      slug: cardObj?.slug || "unknown",
      name: cardObj?.name || "Carta",
      description: cardObj?.description || "",
      rarity: cardObj?.rarity || "COMMON",
      effectType: cardObj?.effect_type || "NONE",
      effectConfig: cardObj?.effect_config || {},
      status: item.status,
      acquiredAt: item.acquired_at,
      consumedAt: item.consumed_at,
      icon: cardDef?.icon || "🃏",
    };
  });

  const groupedBySlug: Record<
    string,
    { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }
  > = {};

  for (const c of cards) {
    if (!groupedBySlug[c.slug]) {
      const cardDef = getCardBySlug(c.slug) || {
        slug: c.slug,
        name: c.name,
        description: c.description,
        rarity: c.rarity,
        effectType: c.effectType as any,
        effectConfig: c.effectConfig,
        enabled: true,
        icon: c.icon,
        requiresTarget: "NONE",
      };
      groupedBySlug[c.slug] = {
        count: 0,
        card: cardDef,
        instances: [],
      };
    }
    if (c.status === "OWNED") {
      groupedBySlug[c.slug].count += 1;
    }
    groupedBySlug[c.slug].instances.push(c);
  }

  const availableCount = cards.filter((c) => c.status === "OWNED").length;

  return {
    cards,
    groupedBySlug,
    availableCount,
  };
}

/**
 * Contagem leve usada no dashboard. Não carrega a definição e o histórico de
 * cada carta só para exibir um número no botão do inventário.
 */
export async function getMyInventoryCount(): Promise<number> {
  const account = await getCurrentAccount();
  if (!account.user) return 0;

  const { count } = await account.client
    .from("fantasy_user_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", account.user.id)
    .eq("status", "OWNED");

  return count || 0;
}

/**
 * Busca a carta ativa de uma rodada para o usuário autenticado.
 */
export async function getActiveCardForRound(roundId: string): Promise<FantasyActiveCardDTO | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;

  const { data: activation } = await account.client
    .from("fantasy_card_activations")
    .select("id, round_id, user_card_id, status, target_snapshot, result_bonus, result_details, card:fantasy_cards(*)")
    .eq("round_id", roundId)
    .eq("user_id", account.user.id)
    .maybeSingle();

  if (!activation || !activation.card) return null;

  const cardObj = Array.isArray(activation.card) ? activation.card[0] : activation.card;
  if (!cardObj) return null;

  const cardDef = getCardBySlug(cardObj.slug) || {
    slug: cardObj.slug,
    name: cardObj.name,
    description: cardObj.description,
    rarity: cardObj.rarity,
    effectType: cardObj.effect_type,
    effectConfig: cardObj.effect_config || {},
    enabled: true,
    icon: "🃏",
    requiresTarget: "NONE",
  };

  const targetSnap = (activation.target_snapshot || {}) as any;
  let targetPlayerName = targetSnap.targetPlayerName || null;
  let targetPlayer2Name = targetSnap.targetPlayer2Name || null;

  // Se não estiver no snapshot, busca os nomes dos jogadores
  const playerIdsToFetch: string[] = [];
  if (targetSnap.targetPlayerId && !targetPlayerName) playerIdsToFetch.push(targetSnap.targetPlayerId);
  if (targetSnap.targetPlayer2Id && !targetPlayer2Name) playerIdsToFetch.push(targetSnap.targetPlayer2Id);

  if (playerIdsToFetch.length > 0) {
    const { data: fetchedPlayers } = await account.client
      .from("players")
      .select("id, name")
      .in("id", playerIdsToFetch);

    if (fetchedPlayers) {
      const nameMap = new Map(fetchedPlayers.map((p) => [p.id, p.name]));
      if (targetSnap.targetPlayerId && !targetPlayerName) {
        targetPlayerName = nameMap.get(targetSnap.targetPlayerId) || null;
      }
      if (targetSnap.targetPlayer2Id && !targetPlayer2Name) {
        targetPlayer2Name = nameMap.get(targetSnap.targetPlayer2Id) || null;
      }
    }
  }

  return {
    id: activation.id,
    roundId: activation.round_id,
    userCardId: activation.user_card_id,
    card: cardDef,
    status: activation.status,
    targetPlayerId: targetSnap.targetPlayerId || null,
    targetPlayerName,
    targetPlayer2Id: targetSnap.targetPlayer2Id || null,
    targetPlayer2Name,
    targetPrediction: targetSnap.targetPrediction || null,
    resultBonus: Number(activation.result_bonus || 0),
    resultDetails: activation.result_details,
  };
}

/**
 * Ativa uma carta para a rodada atual com validações de alvos e mercado aberto.
 */
export async function activateCardForRound({
  roundId,
  userCardId,
  targetPlayerId,
  targetPlayer2Id,
  targetPrediction,
}: {
  roundId: string;
  userCardId: string;
  targetPlayerId?: string | null;
  targetPlayer2Id?: string | null;
  targetPrediction?: "TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE" | null;
}): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = account.client;

  // 1. Verificar status da rodada e mercado
  const { data: round } = await client
    .from("rounds")
    .select("status, round_players(count), matches(id, status, started_at)")
    .eq("id", roundId)
    .single();

  const isLive = (round?.matches || []).some((m: any) => m.started_at || m.status === "in_progress");
  const isMarketOpen = round?.status === "draft" && !isLive;

  if (!isMarketOpen) {
    return { success: false, error: "O mercado já está fechado para esta rodada." };
  }

  // 2. Verificar posse e status da carta do usuário
  const { data: userCard } = await client
    .from("fantasy_user_cards")
    .select("id, user_id, status, card_id, card:fantasy_cards(*)")
    .eq("id", userCardId)
    .single();

  if (!userCard || userCard.user_id !== account.user.id) {
    return { success: false, error: "Carta não encontrada no seu inventário." };
  }

  if (userCard.status !== "OWNED") {
    return { success: false, error: "Esta carta não está disponível para uso." };
  }

  // Mantemos a ativação atual reservada até que a nova carta passe por todas as validações.
  const { data: existingAct } = await client
    .from("fantasy_card_activations")
    .select("id, user_card_id")
    .eq("round_id", roundId)
    .eq("user_id", account.user.id)
    .maybeSingle();

  const userCardObj = Array.isArray(userCard.card) ? userCard.card[0] : userCard.card;

  const { data: fantasyRound } = await client
    .from("fantasy_rounds")
    .select("id, fantasy_season_id")
    .eq("round_id", roundId)
    .maybeSingle();

  const { data: lineup } = fantasyRound
    ? await client
        .from("fantasy_lineups")
        .select("id, captain_player_id, fantasy_lineup_players(player_id, price_locked)")
        .eq("fantasy_round_id", fantasyRound.id)
        .eq("user_id", account.user.id)
        .maybeSingle()
    : { data: null as any };

  const lineupPlayerIds = (lineup?.fantasy_lineup_players || []).map((player: any) => player.player_id);

  const marketTargetSlugs = new Set(["double_prediction", "bargain", "all_in"]);
  const { data: marketPrices } = fantasyRound && marketTargetSlugs.has(userCardObj?.slug || "")
    ? await client
        .from("fantasy_player_prices")
        .select("player_id")
        .eq("fantasy_season_id", fantasyRound.fantasy_season_id)
    : { data: [] as any[] };
  const marketPlayerIds = new Set((marketPrices || []).map((price: any) => price.player_id as string));

  const catalogCard = getCardBySlug(userCardObj?.slug || "");
  if (catalogCard?.requiresTarget === "SINGLE_PLAYER" && !["bargain", "all_in"].includes(userCardObj?.slug || "")) {
    if (!targetPlayerId || !lineupPlayerIds.includes(targetPlayerId)) {
      return { success: false, error: "Escolha um atleta que esteja na sua escalação." };
    }
  }

  if (userCardObj?.slug === "bargain") {
    if (lineupPlayerIds.length > 0) {
      return { success: false, error: "A Barganha deve ser ativada antes de montar a escalação." };
    }
    if (!targetPlayerId || !marketPlayerIds.has(targetPlayerId)) {
      return { success: false, error: "Escolha um atleta válido do mercado para a Barganha." };
    }
  }

  if (userCardObj?.slug === "all_in") {
    if (!targetPlayerId || !marketPlayerIds.has(targetPlayerId)) {
      return { success: false, error: "Escolha qualquer atleta válido do mercado para o All-In." };
    }
  }

  if (userCardObj?.slug === "double_prediction") {
    if (!targetPlayerId || !targetPlayer2Id || targetPlayerId === targetPlayer2Id) {
      return { success: false, error: "Escolha dois jogadores diferentes: um para 2 gols e outro para 2 assistências." };
    }
    if (!marketPlayerIds.has(targetPlayerId) || !marketPlayerIds.has(targetPlayer2Id)) {
      return { success: false, error: "Os dois atletas do Palpite Duplo precisam estar disponíveis no mercado." };
    }
  }

  // 3.1. Validação específica da carta Vice-Capitão (deve ser do time escalado e diferente do Capitão)
  if (userCardObj?.slug === "vice_captain") {
    if (!targetPlayerId) {
      return { success: false, error: "Selecione um jogador escalado para ser o Vice-Capitão." };
    }

    if (lineup) {
      if (lineupPlayerIds.length > 0 && !lineupPlayerIds.includes(targetPlayerId)) {
        return {
          success: false,
          error: "O Vice-Capitão deve ser um jogador titular escalado no seu time.",
        };
      }
      if (lineup.captain_player_id && lineup.captain_player_id === targetPlayerId) {
        return {
          success: false,
          error: "O Vice-Capitão deve ser diferente do Capitão oficial do seu time.",
        };
      }
    }
  }

  // 3.2. Validação específica da carta Dobradinha (deve conter 2 atletas escalados diferentes)
  if (userCardObj?.slug === "duo") {
    if (!targetPlayerId || !targetPlayer2Id) {
      return { success: false, error: "Selecione 2 jogadores escalados para a Dobradinha." };
    }
    if (targetPlayerId === targetPlayer2Id) {
      return { success: false, error: "Selecione 2 jogadores diferentes para a Dobradinha." };
    }

    if (lineup) {
      if (lineupPlayerIds.length > 0) {
        if (!lineupPlayerIds.includes(targetPlayerId) || !lineupPlayerIds.includes(targetPlayer2Id)) {
          return {
            success: false,
            error: "Ambos os jogadores da Dobradinha devem estar escalados no seu time titular.",
          };
        }
      }
    }
  }

  // 3.3. Caça-Talentos: o alvo precisa estar escalado e abaixo da mediana.
  // Em empate total de preços, todos os atletas escalados são elegíveis.
  if (userCardObj?.slug === "scout") {
    if (!targetPlayerId || !lineupPlayerIds.includes(targetPlayerId)) {
      return { success: false, error: "Escolha um atleta que esteja na sua escalação." };
    }
    const { data: marketPrices } = fantasyRound
      ? await client
          .from("fantasy_player_prices")
          .select("player_id, current_price")
          .eq("fantasy_season_id", fantasyRound.fantasy_season_id)
      : { data: [] as any[] };
    const market = (marketPrices || []).map((price: any) => ({ id: price.player_id, price: Number(price.current_price) }));
    const locked = (lineup?.fantasy_lineup_players || []).find((player: any) => player.player_id === targetPlayerId);
    const target = { id: targetPlayerId, price: Number(locked?.price_locked ?? market.find((p) => p.id === targetPlayerId)?.price ?? 0) };
    const targetFilter = "BELOW_MEDIAN_PRICE";
    if (!isFantasyPriceEligible({ targetFilter }, target, market)) {
      return {
        success: false,
        error: "Esse atleta não está abaixo da mediana de preço.",
      };
    }
  }


  // Duelo Direto: o usuário escolhe somente seu atleta. O adversário é
  // sorteado no servidor entre os demais participantes da rodada.
  let resolvedTargetPlayer2Id = targetPlayer2Id || null;
  if (userCardObj?.slug === "head_to_head") {
    const { data: roundPlayers, error: roundPlayersError } = await client
      .from("round_players")
      .select("player_id")
      .eq("round_id", roundId);

    if (roundPlayersError) {
      return { success: false, error: "Não foi possível sortear o adversário do Duelo Direto." };
    }

    const candidates = Array.from(new Set(
      (roundPlayers || [])
        .map((entry: any) => entry.player_id as string)
        .filter((playerId: string) => playerId && playerId !== targetPlayerId),
    ));
    if (candidates.length === 0) {
      return { success: false, error: "Não há outro participante disponível para o Duelo Direto." };
    }
    resolvedTargetPlayer2Id = candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 4. Salvar snapshot do efeito e dos alvos
  const effectSnapshot = {
    cardRulesVersion: 2,
    slug: userCardObj?.slug || "",
    name: userCardObj?.name || "",
    rarity: userCardObj?.rarity || "COMMON",
    effectType: userCardObj?.effect_type || "NONE",
    effectConfig: userCardObj?.effect_config || {},
  };

  const targetSnapshot = {
    targetPlayerId: targetPlayerId || null,
    targetPlayer2Id: resolvedTargetPlayer2Id,
    targetPrediction: targetPrediction || null,
  };

  // Só agora a carta anteriormente reservada é devolvida ao inventário.
  if (existingAct?.user_card_id) {
    await client
      .from("fantasy_user_cards")
      .update({ status: "OWNED" })
      .eq("id", existingAct.user_card_id);
  }

  // Upsert da ativação (UNIQUE(round_id, user_id))
  const { error: actErr } = await client.from("fantasy_card_activations").upsert(
    {
      round_id: roundId,
      user_id: account.user.id,
      user_card_id: userCardId,
      card_id: userCard.card_id,
      effect_snapshot: effectSnapshot,
      target_snapshot: targetSnapshot,
      status: "RESERVED",
      reserved_at: new Date().toISOString(),
    },
    { onConflict: "round_id, user_id" }
  );

  if (actErr) {
    return { success: false, error: `Erro ao ativar carta: ${actErr.message}` };
  }

  // Marcar a carta no inventário como RESERVED
  await client
    .from("fantasy_user_cards")
    .update({ status: "RESERVED" })
    .eq("id", userCardId);

  revalidatePath("/cartola");
  return { success: true };
}

/**
 * Remove a carta ativa antes do fechamento do mercado e devolve para OWNED.
 */
export async function removeActiveCardForRound(
  roundId: string
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = account.client;

  const { data: act } = await client
    .from("fantasy_card_activations")
    .select("id, user_card_id, status")
    .eq("round_id", roundId)
    .eq("user_id", account.user.id)
    .maybeSingle();

  if (!act) return { success: true };

  if (act.status !== "RESERVED") {
    return { success: false, error: "Não é possível remover a carta após o fechamento do mercado." };
  }

  // Devolver carta para OWNED
  if (act.user_card_id) {
    await client
      .from("fantasy_user_cards")
      .update({ status: "OWNED" })
      .eq("id", act.user_card_id);
  }

  // Deletar ativação
  await client.from("fantasy_card_activations").delete().eq("id", act.id);

  revalidatePath("/cartola");
  return { success: true };
}

/**
 * Gera pacotes para todos os usuários que salvaram uma escalação em uma rodada finalizada.
 * Escalações incompletas (`missed`) também recebem o pacote; o prêmio é pela participação,
 * não pela pontuação.
 * Idempotente via UNIQUE(user_id, round_id).
 */
export async function generatePacksForFinishedRound(roundId: string): Promise<number> {
  const client = await getAdminClient();
  if (!client) return 0;

  const { data: ensured, error: ensuredError } = await client.rpc("ensure_fantasy_round_reward_packs", { p_round_id: roundId });
  if (!ensuredError) return Number(ensured || 0);

  // Buscar fantasy_round_id correspondente
  const { data: fantasyRound } = await client
    .from("fantasy_rounds")
    .select("id")
    .eq("round_id", roundId)
    .maybeSingle();

  if (!fantasyRound) return 0;

  // Buscar todas as escalações válidas da rodada
  const { data: lineups } = await client
    .from("fantasy_lineups")
    .select("user_id")
    .eq("fantasy_round_id", fantasyRound.id)
    .in("status", ["scored", "missed"])
    .not("saved_at", "is", null);

  if (!lineups || lineups.length === 0) return 0;

  const userIds = Array.from(new Set(lineups.map((l: any) => l.user_id)));

  const { data: existingRewards } = await client
    .from("fantasy_round_packs")
    .select("user_id")
    .eq("round_id", roundId)
    .eq("source", "round_reward")
    .in("user_id", userIds);
  const alreadyRewarded = new Set((existingRewards || []).map((pack: any) => pack.user_id));

  const packInserts = userIds.filter((userId) => !alreadyRewarded.has(userId)).map((userId) => ({
    user_id: userId,
    round_id: roundId,
    status: "available",
    source: "round_reward",
  }));

  if (packInserts.length === 0) return 0;

  // Inserir com ignore de duplicatas
  const { data: inserted } = await client
    .from("fantasy_round_packs")
    .insert(packInserts)
    .select("id");

  return inserted?.length || 0;
}

/**
 * Cria ou reseta um pacote de teste para a conta logada do administrador.
 */
export async function giveMyAccountTestPack(): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };
  if (!account.isAdmin) return { success: false, error: "Apenas administradores podem gerar pacotes de teste." };

  const client = account.client;

  // Buscar uma rodada qualquer para associar o pacote
  const { data: round } = await client
    .from("rounds")
    .select("id, number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round) {
    return { success: false, error: "Nenhuma rodada encontrada no sistema para associar o pacote." };
  }

  // Deletar pacotes anteriores desta rodada para o usuário poder testar abertura do zero
  const { data: existingPack } = await client
    .from("fantasy_round_packs")
    .select("id")
    .eq("user_id", account.user.id)
    .eq("round_id", round.id)
    .eq("source", "test");

  const existingPackIds = (existingPack || []).map((pack: any) => pack.id);
  if (existingPackIds.length > 0) {
    await client.from("fantasy_pack_offers").delete().in("pack_id", existingPackIds);
    await client.from("fantasy_round_packs").delete().in("id", existingPackIds);
  }

  // Inserir pacote novo
  const { error: insErr } = await client.from("fantasy_round_packs").insert({
    user_id: account.user.id,
    round_id: round.id,
    status: "available",
    source: "test",
    granted_by: account.user.id,
  });

  if (insErr) {
    return { success: false, error: `Erro ao criar pacote: ${insErr.message}` };
  }

  revalidatePath("/cartola");
  return { success: true };
}

/**
 * Zera todas as cartas, ativações e pacotes da conta do usuário autenticado.
 * Deixa o inventário com 0 cartas para permitir um teste limpo do zero.
 */
export async function resetMyAccountCards(): Promise<{
  success: boolean;
  deletedCardsCount?: number;
  deletedActivationsCount?: number;
  deletedPacksCount?: number;
  error?: string;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = account.client;
  const userId = account.user.id;

  try {
    // 1. Deletar ativações de cartas do usuário
    const { count: actCount, error: actErr } = await client
      .from("fantasy_card_activations")
      .delete({ count: "exact" })
      .eq("user_id", userId);

    if (actErr) {
      return { success: false, error: `Erro ao remover ativações: ${actErr.message}` };
    }

    // 2. Deletar inventário de cartas do usuário
    const { count: cardsCount, error: cardsErr } = await client
      .from("fantasy_user_cards")
      .delete({ count: "exact" })
      .eq("user_id", userId);

    if (cardsErr) {
      return { success: false, error: `Erro ao zerar inventário: ${cardsErr.message}` };
    }

    // 3. Buscar pacotes do usuário para remover ofertas e pacotes
    const { data: userPacks } = await client
      .from("fantasy_round_packs")
      .select("id")
      .eq("user_id", userId);

    const packIds = (userPacks || []).map((p: any) => p.id);
    if (packIds.length > 0) {
      await client.from("fantasy_pack_offers").delete().in("pack_id", packIds);
      await client.from("fantasy_round_packs").delete().in("id", packIds);
    }

    revalidatePath("/cartola");
    revalidatePath("/admin/cartola");

    return {
      success: true,
      deletedCardsCount: cardsCount || 0,
      deletedActivationsCount: actCount || 0,
      deletedPacksCount: packIds.length,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro inesperado ao zerar cartas." };
  }
}

/**
 * Concede 1 pacote de cartas para todos os usuários que já escalaram no Cartola.
 * Remove eventuais pacotes abertos/pendentes dessa mesma rodada para garantir que todos recebam um pacote 'available' novinho.
 */
export async function distributePackToAllLineupUsers(): Promise<{
  success: boolean;
  awardedUsersCount?: number;
  roundNumber?: number;
  error?: string;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };
  if (!account.isAdmin) return { success: false, error: "Apenas administradores podem distribuir pacotes em massa." };

  const client = account.client;

  try {
    // 1. Buscar a rodada mais recente ou ativa/draft
    const { data: rounds } = await client
      .from("rounds")
      .select("id, number, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!rounds || rounds.length === 0) {
      return { success: false, error: "Nenhuma rodada encontrada no sistema para associar os pacotes." };
    }

    const targetRound = rounds.find((r: any) => r.status === "draft" || r.status === "active") || rounds[0];

    // 2. Buscar todos os usuários únicos que já escalaram (em fantasy_lineups)
    const { data: lineups, error: lineupErr } = await client
      .from("fantasy_lineups")
      .select("user_id");

    if (lineupErr) {
      return { success: false, error: `Erro ao buscar escalações: ${lineupErr.message}` };
    }

    const uniqueUserIds = Array.from(
      new Set((lineups || []).map((l: any) => l.user_id).filter(Boolean))
    ) as string[];

    if (uniqueUserIds.length === 0) {
      return { success: false, error: "Nenhum usuário com escalação registrada foi encontrado." };
    }

    // 3. Limpar pacotes anteriores desta rodada para estes usuários para garantir um pacote 'available' novo
    const { data: existingPacks } = await client
      .from("fantasy_round_packs")
      .select("id, user_id")
      .eq("round_id", targetRound.id)
      .in("user_id", uniqueUserIds)
      .eq("source", "admin_bulk");

    const existingPackIds = (existingPacks || []).map((p: any) => p.id);
    if (existingPackIds.length > 0) {
      await client.from("fantasy_pack_offers").delete().in("pack_id", existingPackIds);
      await client.from("fantasy_round_packs").delete().in("id", existingPackIds);
    }

    // 4. Inserir os novos pacotes com status 'available'
    const newPacks = uniqueUserIds.map((userId) => ({
      user_id: userId,
      round_id: targetRound.id,
      status: "available",
      source: "admin_bulk",
      granted_by: account.user!.id,
    }));

    const { error: insertErr } = await client
      .from("fantasy_round_packs")
      .insert(newPacks);

    if (insertErr) {
      return { success: false, error: `Erro ao inserir pacotes: ${insertErr.message}` };
    }

    revalidatePath("/cartola");
    revalidatePath("/admin/cartola");

    return {
      success: true,
      awardedUsersCount: uniqueUserIds.length,
      roundNumber: targetRound.number,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro inesperado ao distribuir pacotes." };
  }
}

export async function auditAndRepairCurrentSeasonPacks() {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false as const, error: "Somente administradores podem auditar pacotes." };
  const { getActiveLeague } = await import("./rounds");
  const { getActiveSeason } = await import("./seasons");
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return { success: false as const, error: "Temporada ativa não encontrada." };
  const { data: fantasySeason } = await account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle();
  if (!fantasySeason) return { success: true as const, rounds: [] as any[] };
  const { data: rounds } = await account.client
    .from("fantasy_rounds")
    .select("id, round_id, round:round_id(number, status)")
    .eq("fantasy_season_id", fantasySeason.id)
    .eq("market_status", "finished");
  const report = [] as any[];
  for (const fantasyRound of rounds || []) {
    const [{ data: lineups }, { data: packs }] = await Promise.all([
      account.client.from("fantasy_lineups").select("user_id").eq("fantasy_round_id", fantasyRound.id).in("status", ["scored", "missed"]).not("saved_at", "is", null),
      account.client.from("fantasy_round_packs").select("user_id").eq("round_id", fantasyRound.round_id).eq("source", "round_reward"),
    ]);
    const eligible = [...new Set((lineups || []).map((item: any) => item.user_id))];
    const received = new Set((packs || []).map((item: any) => item.user_id));
    const missing = eligible.filter((userId) => !received.has(userId));
    const repaired = missing.length ? await generatePacksForFinishedRound(fantasyRound.round_id) : 0;
    const { data: profiles } = missing.length
      ? await account.client.from("account_profiles").select("user_id, players(name)").in("user_id", missing)
      : { data: [] as any[] };
    report.push({ roundId: fantasyRound.round_id, roundNumber: (fantasyRound.round as any)?.number || 0, eligible: eligible.length, received: received.size, missing: (profiles || []).map((p: any) => p.players?.name || p.user_id), repaired });
  }
  revalidatePath("/admin/cartola/pacotes");
  return { success: true as const, rounds: report };
}

/** Concede um pacote individual escolhido pelo ADM, sem substituir recompensas anteriores. */
export async function grantFantasyPackToUser(targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) {
    return { success: false, error: "Apenas administradores podem enviar pacotes." };
  }
  if (!targetUserId) return { success: false, error: "Escolha uma pessoa para receber o pacote." };

  const { data: targetProfile } = await account.client
    .from("account_profiles")
    .select("user_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!targetProfile) return { success: false, error: "A conta selecionada não foi encontrada." };

  const { data: round } = await account.client
    .from("rounds")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return { success: false, error: "Crie ao menos uma rodada antes de enviar pacotes." };

  const { error } = await account.client.from("fantasy_round_packs").insert({
    user_id: targetUserId,
    round_id: round.id,
    status: "available",
    source: "admin_gift",
    granted_by: account.user.id,
  });
  if (error) {
    const migrationMissing = error.message.includes("source") || error.message.includes("granted_by");
    return {
      success: false,
      error: migrationMissing
        ? "Execute a migration 053 no Supabase para liberar pacotes administrativos."
        : error.message,
    };
  }

  revalidatePath("/cartola");
  revalidatePath("/admin/cartola/pacotes");
  return { success: true };
}
